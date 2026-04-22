CREATE TYPE user_role AS ENUM ('fan', 'athlete', 'admin');

CREATE TABLE users (
    id UUID PRIMARY KEY,
    email TEXT,
    role user_role NOT NULL DEFAULT 'fan',
    social_provider TEXT,
    zklogin_subject TEXT UNIQUE,
    wallet_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE athlete_profiles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    bio TEXT,
    sport TEXT,
    verified BOOLEAN NOT NULL DEFAULT false,
    verification_metadata JSONB,
    social_links JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id)
);

CREATE TABLE follows (
    fan_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    athlete_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (fan_user_id, athlete_user_id)
);

CREATE TABLE subscription_tiers (
    id UUID PRIMARY KEY,
    athlete_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_mist BIGINT NOT NULL,
    billing_period_days INT NOT NULL,
    perks_json JSONB,
    onchain_tier_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE subscription_status AS ENUM ('active', 'expired', 'cancelled');

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY,
    fan_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    tier_id UUID NOT NULL REFERENCES subscription_tiers (id) ON DELETE CASCADE,
    status subscription_status NOT NULL DEFAULT 'active',
    valid_until TIMESTAMPTZ NOT NULL,
    payer_wallet TEXT,
    last_purchase_tx_digest TEXT,
    entitlement_object_id TEXT,
    renewal_mode TEXT NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE live_sessions (
    id UUID PRIMARY KEY,
    athlete_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    provider_room_id TEXT,
    visibility_tier_id UUID REFERENCES subscription_tiers (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE live_chat_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES live_sessions (id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    moderation_state TEXT NOT NULL DEFAULT 'ok',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE content_type AS ENUM ('post', 'clip', 'file', 'replay');

CREATE TYPE access_rule AS ENUM ('free', 'tier', 'live_replay');

CREATE TABLE content_items (
    id UUID PRIMARY KEY,
    athlete_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type content_type NOT NULL,
    title TEXT NOT NULL,
    media_url TEXT,
    access_rule access_rule NOT NULL,
    required_tier_id UUID REFERENCES subscription_tiers (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    read_at TIMESTAMPTZ,
    delivery_state TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, endpoint)
);

CREATE INDEX idx_follows_athlete ON follows (athlete_user_id);

CREATE INDEX idx_content_athlete ON content_items (athlete_user_id);

CREATE INDEX idx_notifications_user ON notifications (user_id);

CREATE INDEX idx_subscriptions_fan ON subscriptions (fan_user_id);
