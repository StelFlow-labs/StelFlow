#![no_std]
#![doc = include_str!("../README.md")]

mod accrual;
mod error;
mod events;
mod storage;
mod types;

#[cfg(test)]
mod tests;

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, Vec};

use events::{
    MilestoneApproved, Paused, PauserChanged, StreamCanceled, StreamCreated, Unpaused, Withdrawn,
};

pub use accrual::{Position, Resolution, Settlement};
pub use error::Error;
pub use types::{ConfigKey, DataKey, Milestone, MilestoneSpec, MilestoneState, OnExpiry, Stream};

/// Bounds how much a single `withdraw` must deserialize, since milestones live
/// inside the stream struct. Raising it requires re-measuring, not re-arguing.
pub const MAX_MILESTONES_PER_STREAM: u32 = 10;

/// How long a pause lasts before lifting by itself. A pause that outlived its
/// key would otherwise be permanent, since the contract cannot be upgraded.
pub const PAUSE_DURATION_SECONDS: u64 = 30 * 24 * 60 * 60;

/// A stream plus its position, so a client gets everything in one call.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StreamView {
    pub stream: Stream,
    pub position: Position,
    /// The ledger timestamp this was evaluated at. A client animating accrual
    /// needs the contract's clock, not the browser's.
    pub as_of: u64,
}

/// Payment streaming with milestone gates.
///
/// There is no upgrade function, deliberately: only a contract can replace its
/// own Wasm, so an absent function is permanent immutability rather than a
/// policy needing enforcement. The one global role is the pauser, and it
/// reaches exactly one entry point. See `docs/upgradeability-and-pause.md`.
#[contract]
pub struct StelFlow;

#[contractimpl]
impl StelFlow {
    /// Sets the initial pauser atomically with deployment.
    ///
    /// A constructor rather than a callable `initialize`, because the gap
    /// between deploy and init would let anyone claim the role permanently on a
    /// contract that can never be upgraded. Pass `None` for no pauser at all.
    pub fn __constructor(env: Env, pauser: Option<Address>) {
        storage::set_pauser(&env, &pauser);
        storage::set_paused_until(&env, 0);
        storage::init_stream_ids(&env);
        PauserChanged { pauser }.publish(&env);
    }

    // -----------------------------------------------------------------------
    // Streams
    // -----------------------------------------------------------------------

    /// Escrows a deposit and opens a stream.
    ///
    /// The stored `total` is the contract's measured balance delta across the
    /// transfer, not `amount`, so a fee-on-transfer token produces a stream
    /// sized to what actually arrived. Rebasing assets stay unsupported: no
    /// creation-time measurement can bind a balance that moves afterwards.
    #[allow(clippy::too_many_arguments)]
    pub fn create_stream(
        env: Env,
        sender: Address,
        recipient: Address,
        token_id: Address,
        amount: i128,
        start: u64,
        end: u64,
        cliff: u64,
        cancelable: bool,
        milestones: Vec<MilestoneSpec>,
    ) -> Result<u64, Error> {
        sender.require_auth();

        let now = env.ledger().timestamp();
        if now < storage::paused_until(&env) {
            return Err(Error::Paused);
        }

        if end <= start {
            return Err(Error::InvalidTimeRange);
        }
        if cliff < start || cliff > end {
            return Err(Error::InvalidCliff);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if milestones.len() > MAX_MILESTONES_PER_STREAM {
            return Err(Error::TooManyMilestones);
        }
        let mut gated = 0i128;
        let mut tranches = Vec::new(&env);
        for spec in milestones.iter() {
            if spec.amount <= 0 {
                return Err(Error::InvalidAmount);
            }
            // A deadline before `end` would resolve a tranche still accruing,
            // making `streamed_total` non-monotonic.
            if spec.deadline != 0 && spec.deadline < end {
                return Err(Error::InvalidTimeRange);
            }
            gated = gated.checked_add(spec.amount).ok_or(Error::Overflow)?;
            tranches.push_back(spec.into_milestone());
        }

        let contract = env.current_contract_address();
        let client = token::Client::new(&env, &token_id);
        let before = client.balance(&contract);
        client.transfer(&sender, &contract, &amount);
        let received = client.balance(&contract) - before;

        if received <= 0 {
            return Err(Error::NoValueReceived);
        }
        if gated > received {
            return Err(Error::MilestonesExceedTotal);
        }

        let milestone_count = tranches.len();
        let id = storage::next_stream_id(&env);
        let stream = Stream {
            id,
            sender: sender.clone(),
            recipient: recipient.clone(),
            token: token_id.clone(),
            total: received,
            base_amount: received - gated,
            start,
            end,
            cliff,
            cancelable,
            withdrawn: 0,
            milestones: tranches,
            canceled_at: None,
        };
        storage::save_stream(&env, &stream);

        StreamCreated {
            stream_id: id,
            sender,
            recipient,
            token: token_id,
            total: received,
            start,
            end,
            cliff,
            cancelable,
            milestone_count,
        }
        .publish(&env);
        Ok(id)
    }

    /// Pays the recipient everything the formula currently allows.
    ///
    /// Never pausable: a pause that could block this would make an already-earned
    /// balance freezable by a third party.
    pub fn withdraw(env: Env, stream_id: u64) -> Result<i128, Error> {
        let mut stream = storage::load_stream(&env, stream_id)?;
        stream.recipient.require_auth();

        let now = env.ledger().timestamp();
        let payout = accrual::position(&stream, now)?.claimable;
        if payout <= 0 {
            return Err(Error::NothingToWithdraw);
        }

        // The token balance is pooled across streams, so this is what stops one
        // stream's accounting bug reaching another's deposit.
        if payout > stream.total - stream.withdrawn {
            return Err(Error::InsolventStream);
        }

        stream.withdrawn += payout;
        storage::save_stream(&env, &stream);

        token::Client::new(&env, &stream.token).transfer(
            &env.current_contract_address(),
            &stream.recipient,
            &payout,
        );
        Withdrawn {
            stream_id,
            recipient: stream.recipient,
            amount: payout,
            withdrawn_total: stream.withdrawn,
        }
        .publish(&env);
        Ok(payout)
    }

    /// Opens a milestone's gate, releasing accrual that has already happened —
    /// it never accelerates the schedule.
    ///
    /// A second call on an already-met milestone is a no-op, since a duplicate
    /// is overwhelmingly a retry and `Met` is terminal. Authorization is still
    /// checked first, and no second event fires.
    pub fn approve_milestone(env: Env, stream_id: u64, index: u32) -> Result<(), Error> {
        let mut stream = storage::load_stream(&env, stream_id)?;
        let mut milestone = stream
            .milestones
            .get(index)
            .ok_or(Error::MilestoneNotFound)?;

        milestone.approver.require_auth();

        if stream.canceled_at.is_some() {
            return Err(Error::AlreadyCanceled);
        }
        match milestone.state {
            MilestoneState::Met => return Ok(()),
            MilestoneState::Forfeited => return Err(Error::MilestoneForfeited),
            MilestoneState::Unmet => {}
        }

        milestone.state = MilestoneState::Met;
        let approver = milestone.approver.clone();
        let amount = milestone.amount;
        stream.milestones.set(index, milestone);
        storage::save_stream(&env, &stream);

        MilestoneApproved {
            stream_id,
            approver,
            index,
            amount,
        }
        .publish(&env);
        Ok(())
    }

    /// Freezes accrual and settles both sides.
    ///
    /// `cancelable = false` means the sender cannot cancel *alone*, not that
    /// nobody can: with the recipient authorizing too, the same rules apply.
    /// That path exists because the contract can never be upgraded, so an
    /// otherwise unbreakable stream would strand both parties for its lifetime.
    pub fn cancel(env: Env, stream_id: u64) -> Result<Settlement, Error> {
        let mut stream = storage::load_stream(&env, stream_id)?;

        stream.sender.require_auth();
        if !stream.cancelable {
            stream.recipient.require_auth();
        }
        if stream.canceled_at.is_some() {
            return Err(Error::AlreadyCanceled);
        }

        let now = env.ledger().timestamp();
        let settlement = accrual::settle(&stream, now)?;

        if settlement.refund + settlement.recipient_balance > stream.total - stream.withdrawn {
            return Err(Error::InsolventStream);
        }

        // Marking shut gates Forfeited rather than leaving them Unmet is what
        // stops a cancelled stream's milestones later "expiring".
        stream.canceled_at = Some(now);
        for index in 0..stream.milestones.len() {
            let mut milestone = stream.milestones.get(index).unwrap();
            if milestone.state == MilestoneState::Unmet {
                milestone.state = MilestoneState::Forfeited;
                stream.milestones.set(index, milestone);
            }
        }
        storage::save_stream(&env, &stream);

        if settlement.refund > 0 {
            token::Client::new(&env, &stream.token).transfer(
                &env.current_contract_address(),
                &stream.sender,
                &settlement.refund,
            );
        }
        StreamCanceled {
            stream_id,
            refund_to_sender: settlement.refund,
            recipient_balance: settlement.recipient_balance,
            canceled_at: now,
        }
        .publish(&env);
        Ok(settlement)
    }

    /// Extends a stream's TTL. Callable by anyone, so a sender or a third-party
    /// keeper can keep a dormant stream alive.
    pub fn bump_stream(env: Env, stream_id: u64) -> Result<(), Error> {
        storage::bump_stream_ttl(&env, stream_id)
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    pub fn get_stream(env: Env, stream_id: u64) -> Result<Stream, Error> {
        storage::peek_stream(&env, stream_id)
    }

    /// A stream and its position, evaluated against the ledger clock.
    pub fn describe(env: Env, stream_id: u64) -> Result<StreamView, Error> {
        let stream = storage::peek_stream(&env, stream_id)?;
        let as_of = env.ledger().timestamp();
        let position = accrual::position(&stream, as_of)?;
        Ok(StreamView {
            stream,
            position,
            as_of,
        })
    }

    /// What the recipient could withdraw right now.
    pub fn claimable(env: Env, stream_id: u64) -> Result<i128, Error> {
        let stream = storage::peek_stream(&env, stream_id)?;
        Ok(accrual::position(&stream, env.ledger().timestamp())?.claimable)
    }

    /// How a cancellation would divide the deposit if it happened now, so both
    /// parties can see the outcome before either signs.
    pub fn preview_cancel(env: Env, stream_id: u64) -> Result<Settlement, Error> {
        let stream = storage::peek_stream(&env, stream_id)?;
        accrual::settle(&stream, env.ledger().timestamp())
    }

    /// Total streams ever created. Ids run `0..count`.
    pub fn stream_count(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&ConfigKey::NextId)
            .unwrap_or(0)
    }

    // -----------------------------------------------------------------------
    // Pause
    // -----------------------------------------------------------------------

    /// Stops `create_stream` for [`PAUSE_DURATION_SECONDS`]. Renewable, and it
    /// cannot touch a stream that already exists.
    pub fn pause(env: Env) -> Result<u64, Error> {
        Self::require_pauser(&env)?;
        let until = env.ledger().timestamp() + PAUSE_DURATION_SECONDS;
        storage::set_paused_until(&env, until);
        Paused {
            paused_until: until,
        }
        .publish(&env);
        Ok(until)
    }

    pub fn unpause(env: Env) -> Result<(), Error> {
        Self::require_pauser(&env)?;
        storage::set_paused_until(&env, 0);
        Unpaused {
            at: env.ledger().timestamp(),
        }
        .publish(&env);
        Ok(())
    }

    pub fn transfer_pauser(env: Env, new_pauser: Address) -> Result<(), Error> {
        Self::require_pauser(&env)?;
        storage::set_pauser(&env, &Some(new_pauser.clone()));
        PauserChanged {
            pauser: Some(new_pauser),
        }
        .publish(&env);
        Ok(())
    }

    /// Gives up the role permanently — there is no upgrade path that could
    /// restore it, and this discards the only incident response the design has.
    pub fn renounce_pauser(env: Env) -> Result<(), Error> {
        Self::require_pauser(&env)?;
        storage::set_pauser(&env, &None);
        PauserChanged { pauser: None }.publish(&env);
        Ok(())
    }

    pub fn pauser(env: Env) -> Option<Address> {
        storage::pauser(&env)
    }

    /// The timestamp an active pause lifts at, or zero if not paused.
    pub fn paused_until(env: Env) -> u64 {
        let until = storage::paused_until(&env);
        if until > env.ledger().timestamp() {
            until
        } else {
            0
        }
    }

    fn require_pauser(env: &Env) -> Result<Address, Error> {
        let pauser = storage::pauser(env).ok_or(Error::NotPauser)?;
        pauser.require_auth();
        Ok(pauser)
    }
}
