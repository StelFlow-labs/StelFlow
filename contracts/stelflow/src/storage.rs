//! Storage access and TTL policy.
//!
//! Centralised so that no entry point can read a stream and forget to extend it.
//! Every read of a live stream bumps its TTL, which makes ordinary use — the
//! recipient withdrawing now and then — the thing that keeps a stream alive.
//!
//! **No TTL constant is compiled in.** `docs/ttl-strategy.md` measured the live
//! network settings and found one had already changed between protocol versions;
//! `docs/upgradeability-and-pause.md` then removed any admin who could retune a
//! stored value. Both point the same way: derive from [`max_ttl`] at call time,
//! which is the host function Soroban exposes precisely so a contract can ask
//! the current ceiling rather than assume one.

use soroban_sdk::{Address, Env};

use crate::error::Error;
use crate::types::{ConfigKey, DataKey, Stream};

/// Fraction of the network's maximum TTL below which an entry gets extended.
///
/// Extending when an entry drops under half its possible life keeps writes
/// infrequent — a stream touched even twice a year never approaches archival —
/// while leaving a wide margin against a protocol change that lowers the
/// ceiling.
const EXTEND_THRESHOLD_DIVISOR: u32 = 2;

fn max_ttl(env: &Env) -> u32 {
    env.storage().max_ttl()
}

/// Instance storage holds contract-wide config and shares one TTL across the
/// whole contract. Losing it would block *every* stream at once, so it is
/// extended unconditionally on every call that touches it, with no cost-benefit
/// hesitation — the asymmetry argued in `docs/ttl-strategy.md`.
fn bump_instance(env: &Env) {
    let ceiling = max_ttl(env);
    env.storage()
        .instance()
        .extend_ttl(ceiling / EXTEND_THRESHOLD_DIVISOR, ceiling);
}

fn bump_stream(env: &Env, stream_id: u64) {
    let ceiling = max_ttl(env);
    env.storage().persistent().extend_ttl(
        &DataKey::Stream(stream_id),
        ceiling / EXTEND_THRESHOLD_DIVISOR,
        ceiling,
    );
}

// ---------------------------------------------------------------------------
// Streams
// ---------------------------------------------------------------------------

pub fn save_stream(env: &Env, stream: &Stream) {
    env.storage()
        .persistent()
        .set(&DataKey::Stream(stream.id), stream);
    bump_stream(env, stream.id);
}

/// Load a stream, extending its TTL as a side effect.
///
/// If the entry has been archived this call never runs: the host rejects the
/// transaction on its footprint before the contract is invoked. There is no
/// branch to write for that case and none could exist — restoration is the SDK's
/// job, and Protocol 23 makes it automatic for anything driven through
/// simulation. See `docs/behaviour.md`.
pub fn load_stream(env: &Env, stream_id: u64) -> Result<Stream, Error> {
    let stream: Stream = env
        .storage()
        .persistent()
        .get(&DataKey::Stream(stream_id))
        .ok_or(Error::StreamNotFound)?;
    bump_stream(env, stream_id);
    Ok(stream)
}

/// Read without extending, for view functions.
///
/// A view is invoked through simulation and charges nobody, so it must not write
/// — `extend_ttl` in a read path would make every balance query a state change.
pub fn peek_stream(env: &Env, stream_id: u64) -> Result<Stream, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Stream(stream_id))
        .ok_or(Error::StreamNotFound)
}

/// Permissionless TTL extension.
///
/// Deliberately callable by anyone: a sender, a grant administrator, or a
/// third-party keeper can all keep a dormant stream alive. This mirrors
/// `ExtendFootprintTTLOp`, which has no auth check either, so gating it would
/// buy nothing except the illusion of control.
pub fn touch_stream(env: &Env, stream_id: u64) -> Result<(), Error> {
    if !env.storage().persistent().has(&DataKey::Stream(stream_id)) {
        return Err(Error::StreamNotFound);
    }
    bump_stream(env, stream_id);
    Ok(())
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/// Arm the id counter without consuming an id: the first stream created is
/// stream 0.
pub fn init_stream_ids(env: &Env) {
    env.storage().instance().set(&ConfigKey::NextId, &0u64);
    bump_instance(env);
}

/// Reserve the next stream id.
///
/// A monotonic counter rather than a hash of the creation parameters
/// (architecture.md open question 1). A counter makes every creation write one
/// shared entry, which is a contention point — but ids that a person can read
/// out over the phone are worth more to a dashboard than contention-freedom is
/// at this scale, and creation already writes instance storage anyway.
pub fn next_stream_id(env: &Env) -> u64 {
    let id: u64 = env
        .storage()
        .instance()
        .get(&ConfigKey::NextId)
        .unwrap_or(0);
    env.storage().instance().set(&ConfigKey::NextId, &(id + 1));
    bump_instance(env);
    id
}

pub fn set_pauser(env: &Env, pauser: &Option<Address>) {
    env.storage().instance().set(&ConfigKey::Pauser, pauser);
    bump_instance(env);
}

pub fn pauser(env: &Env) -> Option<Address> {
    env.storage()
        .instance()
        .get(&ConfigKey::Pauser)
        .unwrap_or(None)
}

pub fn set_paused_until(env: &Env, until: u64) {
    env.storage()
        .instance()
        .set(&ConfigKey::PausedUntil, &until);
    bump_instance(env);
}

/// The timestamp an active pause lifts at, or zero if never paused.
pub fn paused_until(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&ConfigKey::PausedUntil)
        .unwrap_or(0)
}
