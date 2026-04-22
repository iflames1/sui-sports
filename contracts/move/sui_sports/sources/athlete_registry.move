/// On-chain athlete registry and verifier-gated verification flag.
module sui_sports::athlete_registry;

use sui::event;
use sui::object::{Self, UID};
use sui::transfer;
use sui::tx_context::{Self, TxContext};

public struct AthleteRecord has key, store {
    id: UID,
    athlete: address,
    verified: bool,
}

public struct AdminCap has key, store {
    id: UID,
}

public struct AthleteRegistered has copy, drop {
    athlete: address,
    record_id: ID,
}

public struct AthleteVerified has copy, drop {
    athlete: address,
}

fun init(ctx: &mut TxContext) {
    transfer::transfer(
        AdminCap { id: object::new(ctx) },
        tx_context::sender(ctx),
    );
}

/// Creates a new athlete record for the transaction sender.
public fun register_athlete(ctx: &mut TxContext) {
    let sender = tx_context::sender(ctx);
    let record = AthleteRecord {
        id: object::new(ctx),
        athlete: sender,
        verified: false,
    };
    let record_id = object::id(&record);
    event::emit(AthleteRegistered {
        athlete: sender,
        record_id,
    });
    transfer::transfer(record, sender);
}

/// Verifier (holder of AdminCap) marks an athlete's record as verified.
public fun set_verified(cap: &AdminCap, record: &mut AthleteRecord, _ctx: &mut TxContext) {
    let _ = cap;
    record.verified = true;
    event::emit(AthleteVerified { athlete: record.athlete });
}
