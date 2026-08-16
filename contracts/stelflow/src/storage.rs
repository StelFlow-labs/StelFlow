//! Storage access and TTL policy, centralised so no entry point can read a
//! stream and forget to extend it.
//!
//! No TTL constant is compiled in. `docs/ttl-strategy.md` found one network
//! setting had already changed between protocol versions, and `#33` removed any
//! admin who could retune a stored value — so thresholds derive from
//! `max_ttl()` at call time.

use soroban_sdk::{Address, Env};

use crate::error::Error;
use crate::types::{ConfigKey, DataKey, Stream};

/// Extend when an entry drops below half its possible life: infrequent enough
/// that a stream touched twice a year never approaches archival, with margin
/// against a protocol change that lowers the ceiling.
const EXTEND_THRESHOLD_DIVISOR: u32 = 2;

fn max_ttl(env: &Env) -> u32 {
    env.storage().max_ttl()
}

/// Instance storage shares one TTL across the whole contract, and losing it
/// would block every stream at once — so it is extended unconditionally.
fn bump_instance(env: &Env) {
    let ceiling = max_ttl(env);
    env.storage()
        .instance()
        .extend_ttl(ceiling / EXTEND_THRESHOLD_DIVISOR, ceiling);
}

fn bump_stream_entry(env: &Env, stream_id: u64) {
    let ceiling = max_ttl(env);
    env.storage().persistent().extend_ttl(
        &DataKey::Stream(stream_id),
        ceiling / EXTEND_THRESHOLD_DIVISOR,
        ceiling,
    );
}

pub fn save_stream(env: &Env, stream: &Stream) {
    env.storage()
        .persistent()
        .set(&DataKey::Stream(stream.id), stream);
    bump_stream_entry(env, stream.id);
}

/// Load a stream, extending its TTL as a side effect, so ordinary use is what
/// keeps a stream alive.
///
/// An archived entry never reaches here: the host rejects the transaction on its
/// footprint before the contract runs.
pub fn load_stream(env: &Env, stream_id: u64) -> Result<Stream, Error> {
    let stream: Stream = env
        .storage()
        .persistent()
        .get(&DataKey::Stream(stream_id))
        .ok_or(Error::StreamNotFound)?;
    bump_stream_entry(env, stream_id);
    Ok(stream)
}

/// Read without extending. Views are invoked through simulation and charge
/// nobody, so they must not write.
pub fn peek_stream(env: &Env, stream_id: u64) -> Result<Stream, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Stream(stream_id))
        .ok_or(Error::StreamNotFound)
}

/// Permissionless by design: `ExtendFootprintTTLOp` has no auth check either, so
/// gating this would buy nothing but the illusion of control.
pub fn bump_stream_ttl(env: &Env, stream_id: u64) -> Result<(), Error> {
    if !env.storage().persistent().has(&DataKey::Stream(stream_id)) {
        return Err(Error::StreamNotFound);
    }
    bump_stream_entry(env, stream_id);
    Ok(())
}

/// Arms the counter without consuming an id: the first stream created is 0.
pub fn init_stream_ids(env: &Env) {
    env.storage().instance().set(&ConfigKey::NextId, &0u64);
    bump_instance(env);
}

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

pub fn paused_until(env: &Env) -> u64 {
    env.storage()
        .instance()
        .get(&ConfigKey::PausedUntil)
        .unwrap_or(0)
}
