/// SUI-paid membership receipt (MVP: minted object per purchase; app indexes latest).
module sui_sports::subscription;

use sui::coin::{Self, Coin};
use sui::event;
use sui::object::{Self, UID};
use sui::sui::SUI;
use sui::transfer;
use sui::tx_context::{Self, TxContext};

public struct Membership has key, store {
    id: UID,
    fan: address,
    athlete: address,
    tier_id: vector<u8>,
    valid_until_ms: u64,
}

public struct MembershipPurchased has copy, drop {
    fan: address,
    athlete: address,
    amount_mist: u64,
    valid_until_ms: u64,
}

/// Transfers `payment` to `athlete`, mints a membership object for the sender.
public fun purchase_or_extend(
    payment: Coin<SUI>,
    tier_id: vector<u8>,
    valid_until_ms: u64,
    athlete: address,
    ctx: &mut TxContext,
) {
    let fan = tx_context::sender(ctx);
    let amount = coin::value(&payment);
    transfer::public_transfer(payment, athlete);
    let m = Membership {
        id: object::new(ctx),
        fan,
        athlete,
        tier_id,
        valid_until_ms,
    };
    event::emit(MembershipPurchased {
        fan,
        athlete,
        amount_mist: amount,
        valid_until_ms,
    });
    transfer::transfer(m, fan);
}
