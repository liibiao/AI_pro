--
-- PostgreSQL database dump
--

\restrict g33ml62k1kiQYdtQybInlHiVD6Qd4tSkgfCjcX39SpBTdFHHWPNH5W0R11pQvSx

-- Dumped from database version 16.13 (Homebrew)
-- Dumped by pg_dump version 16.13 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: AgentCreditLedgerType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."AgentCreditLedgerType" AS ENUM (
    'ADMIN_GRANT',
    'VOUCHER_FREEZE',
    'VOUCHER_REDEEM',
    'VOUCHER_CANCEL',
    'VOUCHER_EXPIRE',
    'MANUAL_ADJUST'
);


ALTER TYPE public."AgentCreditLedgerType" OWNER TO postgres;

--
-- Name: AgentCreditVoucherRequestStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."AgentCreditVoucherRequestStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CANCELLED'
);


ALTER TYPE public."AgentCreditVoucherRequestStatus" OWNER TO postgres;

--
-- Name: AgentCreditVoucherStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."AgentCreditVoucherStatus" AS ENUM (
    'AVAILABLE',
    'REDEEMED',
    'CANCELLED',
    'EXPIRED'
);


ALTER TYPE public."AgentCreditVoucherStatus" OWNER TO postgres;

--
-- Name: AgentLevel; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."AgentLevel" AS ENUM (
    'NORMAL',
    'FOUNDER'
);


ALTER TYPE public."AgentLevel" OWNER TO postgres;

--
-- Name: AgentReconciliationOrderStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."AgentReconciliationOrderStatus" AS ENUM (
    'PENDING',
    'CONFIRMED',
    'SETTLED',
    'CANCELLED'
);


ALTER TYPE public."AgentReconciliationOrderStatus" OWNER TO postgres;

--
-- Name: AgentReconciliationOrderType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."AgentReconciliationOrderType" AS ENUM (
    'PREPAID_GRANT',
    'VOUCHER_REDEEM',
    'SETTLEMENT',
    'MANUAL_ADJUST',
    'VOUCHER_REQUEST'
);


ALTER TYPE public."AgentReconciliationOrderType" OWNER TO postgres;

--
-- Name: AgentStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."AgentStatus" AS ENUM (
    'ACTIVE',
    'DISABLED'
);


ALTER TYPE public."AgentStatus" OWNER TO postgres;

--
-- Name: CommissionStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."CommissionStatus" AS ENUM (
    'PENDING',
    'SETTLED',
    'CANCELLED'
);


ALTER TYPE public."CommissionStatus" OWNER TO postgres;

--
-- Name: GenerationRefundSource; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."GenerationRefundSource" AS ENUM (
    'AUTO',
    'ADMIN'
);


ALTER TYPE public."GenerationRefundSource" OWNER TO postgres;

--
-- Name: GenerationRefundStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."GenerationRefundStatus" AS ENUM (
    'PENDING',
    'SUCCESS',
    'FAILED'
);


ALTER TYPE public."GenerationRefundStatus" OWNER TO postgres;

--
-- Name: GenerationTaskStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."GenerationTaskStatus" AS ENUM (
    'CREATED',
    'PENDING',
    'RUNNING',
    'SUCCESS',
    'FAILED',
    'TIMEOUT',
    'REFUNDED',
    'CANCELLED',
    'MANUAL_REVIEW'
);


ALTER TYPE public."GenerationTaskStatus" OWNER TO postgres;

--
-- Name: MemberAccountStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."MemberAccountStatus" AS ENUM (
    'AVAILABLE',
    'CLAIMED',
    'REDEEMED',
    'VOIDED'
);


ALTER TYPE public."MemberAccountStatus" OWNER TO postgres;

--
-- Name: MembershipPlanStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."MembershipPlanStatus" AS ENUM (
    'ACTIVE',
    'DISABLED'
);


ALTER TYPE public."MembershipPlanStatus" OWNER TO postgres;

--
-- Name: ModelStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."ModelStatus" AS ENUM (
    'ACTIVE',
    'DISABLED'
);


ALTER TYPE public."ModelStatus" OWNER TO postgres;

--
-- Name: ModelType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."ModelType" AS ENUM (
    'IMAGE',
    'VIDEO',
    'LLM'
);


ALTER TYPE public."ModelType" OWNER TO postgres;

--
-- Name: ModelUsageStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."ModelUsageStatus" AS ENUM (
    'PENDING',
    'SUCCESS',
    'FAILED'
);


ALTER TYPE public."ModelUsageStatus" OWNER TO postgres;

--
-- Name: PaymentChannel; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."PaymentChannel" AS ENUM (
    'ALIPAY',
    'MOCK',
    'AGENT_VOUCHER',
    'ADMIN_MANUAL'
);


ALTER TYPE public."PaymentChannel" OWNER TO postgres;

--
-- Name: ProviderStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."ProviderStatus" AS ENUM (
    'ACTIVE',
    'DISABLED'
);


ALTER TYPE public."ProviderStatus" OWNER TO postgres;

--
-- Name: RechargeOrderStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."RechargeOrderStatus" AS ENUM (
    'PENDING',
    'PAID',
    'CLOSED',
    'FAILED'
);


ALTER TYPE public."RechargeOrderStatus" OWNER TO postgres;

--
-- Name: RedemptionStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."RedemptionStatus" AS ENUM (
    'SUCCESS',
    'CANCELLED'
);


ALTER TYPE public."RedemptionStatus" OWNER TO postgres;

--
-- Name: SettlementStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."SettlementStatus" AS ENUM (
    'PENDING',
    'SETTLED',
    'CANCELLED'
);


ALTER TYPE public."SettlementStatus" OWNER TO postgres;

--
-- Name: SystemSettingValueType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."SystemSettingValueType" AS ENUM (
    'STRING',
    'NUMBER',
    'BOOLEAN',
    'SECRET'
);


ALTER TYPE public."SystemSettingValueType" OWNER TO postgres;

--
-- Name: TrialCardStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."TrialCardStatus" AS ENUM (
    'AVAILABLE',
    'USED',
    'VOIDED',
    'EXPIRED'
);


ALTER TYPE public."TrialCardStatus" OWNER TO postgres;

--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."UserRole" AS ENUM (
    'USER',
    'AGENT',
    'ADMIN',
    'SUPER_ADMIN'
);


ALTER TYPE public."UserRole" OWNER TO postgres;

--
-- Name: UserStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."UserStatus" AS ENUM (
    'ACTIVE',
    'DISABLED'
);


ALTER TYPE public."UserStatus" OWNER TO postgres;

--
-- Name: WalletLogType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."WalletLogType" AS ENUM (
    'RECHARGE',
    'CONSUME',
    'REFUND',
    'ADMIN_ADD',
    'ADMIN_DEDUCT',
    'COMMISSION',
    'SETTLEMENT'
);


ALTER TYPE public."WalletLogType" OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO postgres;

--
-- Name: account_claims; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_claims (
    id text NOT NULL,
    agent_id text NOT NULL,
    quantity integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.account_claims OWNER TO postgres;

--
-- Name: account_redemptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.account_redemptions (
    id text NOT NULL,
    account_id text NOT NULL,
    agent_id text NOT NULL,
    user_id text NOT NULL,
    plan_id text NOT NULL,
    commission_amount integer DEFAULT 0 NOT NULL,
    status public."RedemptionStatus" DEFAULT 'SUCCESS'::public."RedemptionStatus" NOT NULL,
    redeemed_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.account_redemptions OWNER TO postgres;

--
-- Name: admin_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_logs (
    id text NOT NULL,
    admin_user_id text NOT NULL,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    remark text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.admin_logs OWNER TO postgres;

--
-- Name: agent_credit_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agent_credit_accounts (
    id text NOT NULL,
    agent_id text NOT NULL,
    available_credits integer DEFAULT 0 NOT NULL,
    frozen_credits integer DEFAULT 0 NOT NULL,
    used_credits integer DEFAULT 0 NOT NULL,
    credit_limit integer DEFAULT 0 NOT NULL,
    receivable_credits integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.agent_credit_accounts OWNER TO postgres;

--
-- Name: agent_credit_ledgers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agent_credit_ledgers (
    id text NOT NULL,
    agent_id text NOT NULL,
    type public."AgentCreditLedgerType" NOT NULL,
    amount integer NOT NULL,
    balance_before integer NOT NULL,
    balance_after integer NOT NULL,
    related_type text,
    related_id text,
    remark text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.agent_credit_ledgers OWNER TO postgres;

--
-- Name: agent_credit_voucher_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agent_credit_voucher_requests (
    id text NOT NULL,
    request_no text NOT NULL,
    agent_id text NOT NULL,
    user_id text NOT NULL,
    credits integer NOT NULL,
    amount_cents integer DEFAULT 0 NOT NULL,
    valid_days integer DEFAULT 30 NOT NULL,
    transfer_channel text,
    transfer_no text,
    proof_image_url text,
    remark text,
    status public."AgentCreditVoucherRequestStatus" DEFAULT 'PENDING'::public."AgentCreditVoucherRequestStatus" NOT NULL,
    voucher_id text,
    reconciliation_order_id text,
    code_encrypted text,
    code_viewed_at timestamp(3) without time zone,
    reviewed_by_admin_id text,
    reviewed_at timestamp(3) without time zone,
    reject_reason text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.agent_credit_voucher_requests OWNER TO postgres;

--
-- Name: agent_credit_vouchers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agent_credit_vouchers (
    id text NOT NULL,
    voucher_no text NOT NULL,
    code_hash text NOT NULL,
    code_last4 text NOT NULL,
    agent_id text NOT NULL,
    user_id text NOT NULL,
    credits integer NOT NULL,
    amount_cents integer DEFAULT 0 NOT NULL,
    status public."AgentCreditVoucherStatus" DEFAULT 'AVAILABLE'::public."AgentCreditVoucherStatus" NOT NULL,
    expired_at timestamp(3) without time zone NOT NULL,
    redeemed_at timestamp(3) without time zone,
    recharge_order_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.agent_credit_vouchers OWNER TO postgres;

--
-- Name: agent_customers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agent_customers (
    id text NOT NULL,
    agent_id text NOT NULL,
    user_id text NOT NULL,
    customer_phone text,
    customer_name text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.agent_customers OWNER TO postgres;

--
-- Name: agent_reconciliation_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agent_reconciliation_orders (
    id text NOT NULL,
    order_no text NOT NULL,
    agent_id text NOT NULL,
    type public."AgentReconciliationOrderType" NOT NULL,
    status public."AgentReconciliationOrderStatus" DEFAULT 'PENDING'::public."AgentReconciliationOrderStatus" NOT NULL,
    credits integer DEFAULT 0 NOT NULL,
    amount_cents integer DEFAULT 0 NOT NULL,
    transfer_channel text,
    transfer_no text,
    proof_image_url text,
    related_type text,
    related_id text,
    remark text,
    confirmed_by_admin_id text,
    confirmed_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.agent_reconciliation_orders OWNER TO postgres;

--
-- Name: agents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.agents (
    id text NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    level public."AgentLevel" DEFAULT 'NORMAL'::public."AgentLevel" NOT NULL,
    parent_agent_id text,
    commission_rate numeric(8,4) DEFAULT 0 NOT NULL,
    settlement_delay_days integer DEFAULT 1 NOT NULL,
    status public."AgentStatus" DEFAULT 'ACTIVE'::public."AgentStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.agents OWNER TO postgres;

--
-- Name: ai_models; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_models (
    id text NOT NULL,
    provider_id text NOT NULL,
    name text NOT NULL,
    display_name text NOT NULL,
    type public."ModelType" NOT NULL,
    unit text NOT NULL,
    sale_price integer DEFAULT 0 NOT NULL,
    cost_price numeric(12,4) DEFAULT 0 NOT NULL,
    price_per_second integer DEFAULT 0 NOT NULL,
    input_price_usd_per_1m numeric(12,6) DEFAULT 0 NOT NULL,
    output_price_usd_per_1m numeric(12,6) DEFAULT 0 NOT NULL,
    cny_per_usd_cost numeric(12,6) DEFAULT 0 NOT NULL,
    credits_per_usd_cost numeric(12,6) DEFAULT 0 NOT NULL,
    markup_rate numeric(12,6) DEFAULT 1 NOT NULL,
    status public."ModelStatus" DEFAULT 'ACTIVE'::public."ModelStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    adapter text,
    endpoint_path text,
    status_endpoint_path text,
    upload_mode text,
    protocol jsonb,
    supports jsonb,
    defaults jsonb,
    capabilities jsonb,
    model_assembly jsonb,
    ui jsonb,
    model_key text
);


ALTER TABLE public.ai_models OWNER TO postgres;

--
-- Name: canvas_workflows; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.canvas_workflows (
    id text NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    data_json jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.canvas_workflows OWNER TO postgres;

--
-- Name: commission_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.commission_logs (
    id text NOT NULL,
    agent_id text NOT NULL,
    user_id text,
    source_type text NOT NULL,
    source_id text NOT NULL,
    redemption_id text,
    amount integer NOT NULL,
    status public."CommissionStatus" DEFAULT 'PENDING'::public."CommissionStatus" NOT NULL,
    settled_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.commission_logs OWNER TO postgres;

--
-- Name: generation_refunds; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.generation_refunds (
    id text NOT NULL,
    task_id text NOT NULL,
    user_id text NOT NULL,
    amount integer NOT NULL,
    status public."GenerationRefundStatus" DEFAULT 'PENDING'::public."GenerationRefundStatus" NOT NULL,
    source public."GenerationRefundSource" DEFAULT 'AUTO'::public."GenerationRefundSource" NOT NULL,
    reason text,
    operator_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    processed_at timestamp(3) without time zone
);


ALTER TABLE public.generation_refunds OWNER TO postgres;

--
-- Name: generation_tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.generation_tasks (
    id text NOT NULL,
    user_id text NOT NULL,
    provider_id text NOT NULL,
    model_id text NOT NULL,
    channel_key text NOT NULL,
    type public."ModelType" NOT NULL,
    mode text NOT NULL,
    status public."GenerationTaskStatus" DEFAULT 'CREATED'::public."GenerationTaskStatus" NOT NULL,
    prompt text NOT NULL,
    negative_prompt text,
    input_files_json jsonb,
    params_json jsonb,
    request_json jsonb,
    response_json jsonb,
    upstream_task_id text,
    upstream_request_id text,
    result_json jsonb,
    result_urls_json jsonb,
    charged_credits integer DEFAULT 0 NOT NULL,
    cost_amount numeric(12,4) DEFAULT 0 NOT NULL,
    cost_usd numeric(12,6) DEFAULT 0 NOT NULL,
    refund_credits integer DEFAULT 0 NOT NULL,
    refund_status text DEFAULT 'NONE'::text NOT NULL,
    refund_reason text,
    error_code text,
    error_message text,
    retry_count integer DEFAULT 0 NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    started_at timestamp(3) without time zone,
    completed_at timestamp(3) without time zone,
    failed_at timestamp(3) without time zone,
    refunded_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    client_request_id text
);


ALTER TABLE public.generation_tasks OWNER TO postgres;

--
-- Name: member_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.member_accounts (
    id text NOT NULL,
    code text NOT NULL,
    plan_id text NOT NULL,
    status public."MemberAccountStatus" DEFAULT 'AVAILABLE'::public."MemberAccountStatus" NOT NULL,
    claimed_agent_id text,
    claimed_at timestamp(3) without time zone,
    redeemed_user_id text,
    redeemed_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.member_accounts OWNER TO postgres;

--
-- Name: membership_plans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.membership_plans (
    id text NOT NULL,
    name text NOT NULL,
    price integer NOT NULL,
    duration_days integer NOT NULL,
    status public."MembershipPlanStatus" DEFAULT 'ACTIVE'::public."MembershipPlanStatus" NOT NULL
);


ALTER TABLE public.membership_plans OWNER TO postgres;

--
-- Name: model_usages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.model_usages (
    id text NOT NULL,
    user_id text NOT NULL,
    model_id text NOT NULL,
    model_type public."ModelType" NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    duration_seconds integer DEFAULT 0 NOT NULL,
    sale_amount integer DEFAULT 0 NOT NULL,
    cost_amount numeric(12,4) DEFAULT 0 NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    total_tokens integer DEFAULT 0 NOT NULL,
    cost_usd numeric(12,6) DEFAULT 0 NOT NULL,
    charged_credits integer DEFAULT 0 NOT NULL,
    status public."ModelUsageStatus" DEFAULT 'PENDING'::public."ModelUsageStatus" NOT NULL,
    prompt text,
    request_json jsonb,
    response_json jsonb,
    result_url text,
    request_id text,
    upstream_task_id text,
    error_message text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.model_usages OWNER TO postgres;

--
-- Name: provider_health_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.provider_health_logs (
    id text NOT NULL,
    provider_id text NOT NULL,
    model_id text,
    task_id text,
    status text NOT NULL,
    latency_ms integer DEFAULT 0 NOT NULL,
    error_code text,
    error_message text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.provider_health_logs OWNER TO postgres;

--
-- Name: recharge_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.recharge_orders (
    id text NOT NULL,
    order_no text NOT NULL,
    user_id text NOT NULL,
    channel public."PaymentChannel" NOT NULL,
    status public."RechargeOrderStatus" DEFAULT 'PENDING'::public."RechargeOrderStatus" NOT NULL,
    amount_cents integer NOT NULL,
    credits integer NOT NULL,
    qr_code text,
    payment_trade_no text,
    notify_payload jsonb,
    paid_at timestamp(3) without time zone,
    expired_at timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.recharge_orders OWNER TO postgres;

--
-- Name: settlements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.settlements (
    id text NOT NULL,
    agent_id text NOT NULL,
    amount integer NOT NULL,
    status public."SettlementStatus" DEFAULT 'PENDING'::public."SettlementStatus" NOT NULL,
    remark text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    settled_at timestamp(3) without time zone
);


ALTER TABLE public.settlements OWNER TO postgres;

--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.system_settings (
    id text NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    setting_group text NOT NULL,
    value text,
    value_type public."SystemSettingValueType" DEFAULT 'STRING'::public."SystemSettingValueType" NOT NULL,
    is_secret boolean DEFAULT false NOT NULL,
    remark text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.system_settings OWNER TO postgres;

--
-- Name: trial_cards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.trial_cards (
    id text NOT NULL,
    code text NOT NULL,
    agent_id text,
    plan_id text NOT NULL,
    status public."TrialCardStatus" DEFAULT 'AVAILABLE'::public."TrialCardStatus" NOT NULL,
    expired_at timestamp(3) without time zone NOT NULL,
    used_user_id text,
    used_at timestamp(3) without time zone
);


ALTER TABLE public.trial_cards OWNER TO postgres;

--
-- Name: upstream_providers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.upstream_providers (
    id text NOT NULL,
    name text NOT NULL,
    base_url text NOT NULL,
    api_key_encrypted text NOT NULL,
    status public."ProviderStatus" DEFAULT 'ACTIVE'::public."ProviderStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    provider_key text NOT NULL,
    type public."ModelType",
    adapter text DEFAULT 'openai-image'::text NOT NULL,
    endpoint_path text,
    status_endpoint_path text,
    upload_mode text,
    request_method text,
    default_model text,
    default_params jsonb,
    timeout_ms integer DEFAULT 60000 NOT NULL,
    weight integer DEFAULT 100 NOT NULL,
    concurrency_limit integer DEFAULT 0 NOT NULL,
    failure_threshold integer DEFAULT 5 NOT NULL
);


ALTER TABLE public.upstream_providers OWNER TO postgres;

--
-- Name: user_memberships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_memberships (
    id text NOT NULL,
    user_id text NOT NULL,
    plan_id text NOT NULL,
    started_at timestamp(3) without time zone NOT NULL,
    expired_at timestamp(3) without time zone NOT NULL,
    source text NOT NULL
);


ALTER TABLE public.user_memberships OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id text NOT NULL,
    phone text,
    email text,
    password_hash text NOT NULL,
    nickname text NOT NULL,
    role public."UserRole" DEFAULT 'USER'::public."UserRole" NOT NULL,
    status public."UserStatus" DEFAULT 'ACTIVE'::public."UserStatus" NOT NULL,
    agent_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: wallet_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wallet_logs (
    id text NOT NULL,
    user_id text NOT NULL,
    type public."WalletLogType" NOT NULL,
    amount integer NOT NULL,
    balance_before integer NOT NULL,
    balance_after integer NOT NULL,
    related_type text,
    related_id text,
    remark text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.wallet_logs OWNER TO postgres;

--
-- Name: wallets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wallets (
    id text NOT NULL,
    user_id text NOT NULL,
    balance integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.wallets OWNER TO postgres;

--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
9a423984-826d-4d0d-8dbe-048e76c0754b	77dde21527539d2b58d11b0ced02e604475d1bddf75be797dd1d6eb456848f3d	2026-05-09 01:46:32.769735+08	202605090001_initial	\N	\N	2026-05-09 01:46:32.748743+08	1
84955655-af98-41c6-9f99-ee5ed0aa6a57	f6b4c5f907583d8afc891671cc4a49ffe9641e77851276e22bdccdeb57df3cf2	2026-05-09 02:06:18.41916+08	20260508180618_add_recharge_orders	\N	\N	2026-05-09 02:06:18.410206+08	1
9697dc2b-0719-4fb9-a6c0-cd77c83ffc3b	5098d806b12a09ae9e67803338deed9901e3f8731a497a38d305ccdbdfa70610	2026-05-09 11:20:27.50247+08	20260509120000_add_system_settings	\N	\N	2026-05-09 11:20:27.483962+08	1
3507e255-c9f7-4c14-9f72-d6bdaf9aadcd	7425acad1bcbfb17c7fdec5f42c8858ff188674ff753c69df8e2e902f467e817	2026-05-09 13:30:23.355064+08	20260509123000_add_ai_model_protocol_config	\N	\N	2026-05-09 13:30:23.34576+08	1
d55ede43-6206-4fcf-b452-9f9c669865b9	7f4cf761d6b35ee3c4dca0a08ab21fca380d355e9a25916df2590d285ce75761	2026-05-09 21:10:32.090455+08	20260509143000_add_agent_credit_vouchers	\N	\N	2026-05-09 21:10:32.016635+08	1
fc07f588-98c9-411e-ac78-c43076166e6e	f01d1c47a5eeb78358633225ddacbdef9be5aae1935bed6f2dd781d7150d68d8	2026-05-13 15:01:55.070317+08	20260513130500_generation_hub	\N	\N	2026-05-13 15:01:55.022274+08	1
a7085bfe-9f5e-4200-becd-33b930d0bf20	40983eab9881c74d9d9d7e5f09e9fb9608d8228f73a674269577e55cc501a3bc	2026-05-15 21:11:05.900929+08	20260515110000_generation_idempotency	\N	\N	2026-05-15 21:11:05.887821+08	1
c38398c3-ae36-472a-90e0-84604a6a3731	a0760dfd107624a76910e956fa223bff176521620c4964557a45ea6f1690d6b5	2026-05-15 23:59:42.683632+08	20260515162000_decimal_cost_and_pricing_defaults	\N	\N	2026-05-15 23:59:42.622682+08	1
220042ab-57da-4926-9d9e-22185c4d075e	2e24894841bb0ca861c096bedad135cecacd85884b14633044637cbc140751a3	2026-05-16 10:31:14.666625+08	20260516130000_add_agent_credit_voucher_requests	\N	\N	2026-05-16 10:31:14.634163+08	1
\.


--
-- Data for Name: account_claims; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.account_claims (id, agent_id, quantity, created_at) FROM stdin;
\.


--
-- Data for Name: account_redemptions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.account_redemptions (id, account_id, agent_id, user_id, plan_id, commission_amount, status, redeemed_at) FROM stdin;
\.


--
-- Data for Name: admin_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.admin_logs (id, admin_user_id, action, target_type, target_id, remark, created_at) FROM stdin;
\.


--
-- Data for Name: agent_credit_accounts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.agent_credit_accounts (id, agent_id, available_credits, frozen_credits, used_credits, credit_limit, receivable_credits, created_at, updated_at) FROM stdin;
cmp7r4i1q0005tg9kb3ym63e9	cmp5unz4c000jtgh61zjedpzg	0	0	0	0	0	2026-05-16 02:53:11.391	2026-05-16 02:53:11.391
\.


--
-- Data for Name: agent_credit_ledgers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.agent_credit_ledgers (id, agent_id, type, amount, balance_before, balance_after, related_type, related_id, remark, created_at) FROM stdin;
\.


--
-- Data for Name: agent_credit_voucher_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.agent_credit_voucher_requests (id, request_no, agent_id, user_id, credits, amount_cents, valid_days, transfer_channel, transfer_no, proof_image_url, remark, status, voucher_id, reconciliation_order_id, code_encrypted, code_viewed_at, reviewed_by_admin_id, reviewed_at, reject_reason, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: agent_credit_vouchers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.agent_credit_vouchers (id, voucher_no, code_hash, code_last4, agent_id, user_id, credits, amount_cents, status, expired_at, redeemed_at, recharge_order_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: agent_customers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.agent_customers (id, agent_id, user_id, customer_phone, customer_name, created_at) FROM stdin;
\.


--
-- Data for Name: agent_reconciliation_orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.agent_reconciliation_orders (id, order_no, agent_id, type, status, credits, amount_cents, transfer_channel, transfer_no, proof_image_url, related_type, related_id, remark, confirmed_by_admin_id, confirmed_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: agents; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.agents (id, user_id, name, level, parent_agent_id, commission_rate, settlement_delay_days, status, created_at) FROM stdin;
cmp5unz4c000jtgh61zjedpzg	cmp5unay6000dtgh6lqdgxfye	BillyProxy	NORMAL	\N	0.7000	1	ACTIVE	2026-05-14 18:56:46.477
\.


--
-- Data for Name: ai_models; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ai_models (id, provider_id, name, display_name, type, unit, sale_price, cost_price, price_per_second, input_price_usd_per_1m, output_price_usd_per_1m, cny_per_usd_cost, credits_per_usd_cost, markup_rate, status, created_at, adapter, endpoint_path, status_endpoint_path, upload_mode, protocol, supports, defaults, capabilities, model_assembly, ui, model_key) FROM stdin;
canvas-gpt-image-2-pro	canvas-provider-gpt-image-2-pro	gpt-image-2	GPT-Image-2-pro	IMAGE	image_resolution_tier	5	3.5000	0	0.000000	0.000000	0.000000	0.000000	1.000000	ACTIVE	2026-05-09 05:32:10.747	openai-edits	/images/edits	\N	files	{"adapter": "openai-edits", "uploadMode": "files", "endpointPath": "/images/edits"}	{"img2img": true, "txt2img": true}	{"pricing": {"unit": "image_resolution_tier", "tiers": [{"tier": "1K", "costCredits": 3.5, "chargedCredits": 5, "grossMarginRate": 0.3}, {"tier": "2K", "costCredits": 5.6, "chargedCredits": 8, "grossMarginRate": 0.3}, {"tier": "3K", "costCredits": 17.5, "chargedCredits": 25, "grossMarginRate": 0.3}, {"tier": "4K", "costCredits": 35, "chargedCredits": 50, "grossMarginRate": 0.3}], "currency": "credits", "creditsPerCny": 100}}	\N	\N	{"badge": "V1", "label": "GPT-Image-2-pro", "badgeColor": "#10b981"}	gpt-image-2
canvas-grok-llm	canvas-provider-grok-llm	grok-4	Grok-4	LLM	token_usd_ratio	0	0.0000	0	0.000000	0.000000	0.000000	0.000000	1.000000	ACTIVE	2026-05-15 17:13:03.261	grok-chat	/chat/completions	\N	\N	{"method": "sync", "adapter": "grok-chat", "endpointPath": "/chat/completions"}	{"chat": true, "vision": true}	{"pricing": {"unit": "token_usd_ratio", "currency": "credits", "creditsPerCny": 100}}	\N	\N	{"badge": "LLM", "label": "Grok-4", "badgeColor": "#334155"}	grok-4
canvas-sora-2	canvas-provider-sora-2	sora-2	sora-2	VIDEO	second	0	25.2000	36	0.000000	0.000000	0.000000	0.000000	1.000000	ACTIVE	2026-05-09 05:32:10.755	notevideo	/videos	/videos/{taskId}	\N	{"method": "async-poll", "adapter": "notevideo", "endpointPath": "/videos", "statusEndpointPath": "/videos/{taskId}"}	\N	{"pricing": {"unit": "second", "currency": "credits", "creditsPerCny": 100, "grossMarginRate": 0.3, "costCreditsPerSecond": 25.2, "chargedCreditsPerSecond": 36}}	{"durations": [4, 8, 12], "maxImages": {"full": 4, "firstLast": 2, "smartMultiFrame": 4}, "resolutions": ["720p"], "supportsAudio": false, "supportsVideo": false, "defaultDuration": 12, "defaultResolution": "720p"}	{"type": "passthrough"}	{"label": "sora-2"}	sora-2
canvas-sora-v3-vip	canvas-provider-sora-v3-vip	sora-v3-vip	sora-v3-vip	VIDEO	second	0	25.2000	36	0.000000	0.000000	0.000000	0.000000	1.000000	ACTIVE	2026-05-09 05:32:10.761	notevideo	/videos	/videos/{taskId}	\N	{"method": "async-poll", "adapter": "notevideo", "endpointPath": "/videos", "statusEndpointPath": "/videos/{taskId}"}	\N	{"pricing": {"unit": "second", "currency": "credits", "creditsPerCny": 100, "grossMarginRate": 0.3, "costCreditsPerSecond": 25.2, "chargedCreditsPerSecond": 36}}	{"durations": [10, 15], "maxImages": {"full": 9, "firstLast": 2, "smartMultiFrame": 9}, "resolutions": ["720p", "1080p"], "supportsAudio": true, "supportsVideo": true, "defaultDuration": 15, "defaultResolution": "1080p"}	{"type": "template", "template": "sora-v3-vip-{resolution}-{duration}s"}	{"badge": "VIP", "label": "sora-v3-vip", "badgeColor": "#f59e0b"}	sora-v3-vip
cmp3ppfg40002tg86g79xwyw3	cmp3ppfg20000tg86epxnornm	gemini-3-pro-image-preview	gemini-3-pro	IMAGE	image_resolution_tier	5	3.5000	0	0.000000	0.000000	0.000000	0.000000	1.000000	DISABLED	2026-05-13 07:02:23.861	gemini-image	/v1beta/models/{model}:generateContent	\N	object_storage	{"method": "sync", "adapter": "gemini-image", "uploadMode": "object_storage", "endpointPath": "/v1beta/models/{model}:generateContent"}	{"img2img": true, "txt2img": true, "panorama": true, "storyboard": true, "imageToImage": true}	{"pricing": {"unit": "image_resolution_tier", "tiers": [{"tier": "1K", "costCredits": 3.5, "chargedCredits": 5, "grossMarginRate": 0.3}, {"tier": "2K", "costCredits": 5.6, "chargedCredits": 8, "grossMarginRate": 0.3}, {"tier": "3K", "costCredits": 17.5, "chargedCredits": 25, "grossMarginRate": 0.3}, {"tier": "4K", "costCredits": 35, "chargedCredits": 50, "grossMarginRate": 0.3}], "currency": "credits", "creditsPerCny": 100}}	\N	{"type": "passthrough"}	{"label": "gemini-3-pro"}	gemini-3-pro-image-preview
canvas-gpt-image-v2	canvas-provider-gpt-image-v2	gpt-image-2	GPT-Image-V2	IMAGE	image_resolution_tier	5	3.5000	0	0.000000	0.000000	0.000000	0.000000	1.000000	DISABLED	2026-05-09 05:32:10.751	gpt-image-v2	/images/generations	\N	object_storage	{"method": "sync", "adapter": "gpt-image-v2", "uploadMode": "object_storage", "endpointPath": "/images/generations"}	{"img2img": true, "txt2img": true}	{"pricing": {"unit": "image_resolution_tier", "tiers": [{"tier": "1K", "costCredits": 3.5, "chargedCredits": 5, "grossMarginRate": 0.3}, {"tier": "2K", "costCredits": 5.6, "chargedCredits": 8, "grossMarginRate": 0.3}, {"tier": "3K", "costCredits": 17.5, "chargedCredits": 25, "grossMarginRate": 0.3}, {"tier": "4K", "costCredits": 35, "chargedCredits": 50, "grossMarginRate": 0.3}], "currency": "credits", "creditsPerCny": 100}, "resolution": "2k", "reasoning_effort": "medium"}	\N	\N	{"badge": "V2", "label": "GPT-Image-V2", "badgeColor": "#6366f1"}	gpt-image-2
cmp5rj48j000gtgkjssab37wc	cmp5rj48d000etgkjl44od5dk	sora-v3-fast	sora-v3-fast	VIDEO	second	0	25.2000	36	0.000000	0.000000	0.000000	0.000000	1.000000	ACTIVE	2026-05-14 17:29:00.98	notevideo	/videos	/videos/{taskId}	\N	{"method": "async-poll", "adapter": "notevideo", "endpointPath": "/videos", "statusEndpointPath": "/videos/{taskId}"}	\N	{"pricing": {"unit": "second", "currency": "credits", "creditsPerCny": 100, "grossMarginRate": 0.3, "costCreditsPerSecond": 25.2, "chargedCreditsPerSecond": 36}}	{"durations": [5, 10, 15], "resolutions": ["720p"], "supportsAudio": false, "supportsVideo": true, "defaultDuration": 15, "defaultResolution": "720p"}	{"type": "passthrough"}	{"label": "sora-v3-fast"}	sora-v3-fast
cmp5ue4vn0008tgh6syy7o3zb	cmp5ue4vk0006tgh6w1u032cw	gpt-5.4	gpt-5.4	LLM	token_usd_ratio	0	0.0000	0	0.000000	0.000000	0.200000	20.000000	1.000000	ACTIVE	2026-05-14 18:49:07.379	openai-chat	/chat/completions	\N	\N	{"method": "sync", "adapter": "openai-chat", "endpointPath": "/chat/completions"}	\N	{"pricing": {"unit": "token_usd_ratio", "currency": "credits", "creditsPerCny": 100}}	\N	{"type": "passthrough"}	{"label": "gpt-5.4"}	gpt-5-4
seed-gpt-5-5	cmoxv7iob0000tg56i4edfsb9	gpt-5.5	GPT 5.5	LLM	token_usd_ratio	0	0.0000	0	1.000000	5.000000	0.800000	80.000000	1.000000	ACTIVE	2026-05-08 17:46:50.585	openai-chat	/chat/completions	\N	\N	{"method": "sync", "adapter": "openai-chat", "endpointPath": "/chat/completions"}	\N	{"pricing": {"unit": "token_usd_ratio", "currency": "credits", "creditsPerCny": 100}}	\N	\N	{"label": "GPT 5.5"}	gpt-5-5
canvas-grok-image	canvas-provider-grok-image	grok-imagine-1.0	Grok 文生图	IMAGE	image_resolution_tier	5	3.5000	0	0.000000	0.000000	0.000000	0.000000	1.000000	ACTIVE	2026-05-15 17:13:03.259	grok-image	/images/generations	\N	object_storage	{"method": "sync", "adapter": "grok-image", "uploadMode": "object_storage", "endpointPath": "/images/generations"}	{"img2img": false, "txt2img": true, "panorama": false, "storyboard": true, "imageToImage": false}	{"size": "1024x1024", "pricing": {"unit": "image_resolution_tier", "tiers": [{"tier": "1K", "costCredits": 3.5, "chargedCredits": 5, "grossMarginRate": 0.3}, {"tier": "2K", "costCredits": 5.6, "chargedCredits": 8, "grossMarginRate": 0.3}, {"tier": "3K", "costCredits": 17.5, "chargedCredits": 25, "grossMarginRate": 0.3}, {"tier": "4K", "costCredits": 35, "chargedCredits": 50, "grossMarginRate": 0.3}], "currency": "credits", "creditsPerCny": 100}}	\N	\N	{"badge": "Grok", "label": "Grok 文生图", "badgeColor": "#111827"}	grok-imagine-1-0
canvas-sora-v3-pro	canvas-provider-sora-v3-pro	sora-v3-pro	sora-v3-pro	VIDEO	second	0	25.2000	36	0.000000	0.000000	0.000000	0.000000	1.000000	ACTIVE	2026-05-09 05:32:10.759	notevideo	/videos	/videos/{taskId}	\N	{"method": "async-poll", "adapter": "notevideo", "endpointPath": "/videos", "statusEndpointPath": "/videos/{taskId}"}	\N	{"pricing": {"unit": "second", "currency": "credits", "creditsPerCny": 100, "grossMarginRate": 0.3, "costCreditsPerSecond": 25.2, "chargedCreditsPerSecond": 36}}	{"durations": [5, 8, 10, 15], "maxImages": {"full": 4, "firstLast": 2, "smartMultiFrame": 4}, "resolutions": ["720p"], "supportsAudio": false, "supportsVideo": true, "defaultDuration": 15, "defaultResolution": "720p"}	{"type": "passthrough"}	{"badge": "FAST", "label": "sora-v3-pro", "badgeColor": "#6ee7b7"}	sora-v3-pro
canvas-gemini-llm	canvas-provider-gemini-llm	gemini-3-flash	Gemini 3 Flash	LLM	token_usd_ratio	0	0.0000	0	0.000000	0.000000	0.000000	0.000000	1.000000	ACTIVE	2026-05-16 01:25:39.95	gemini-chat	/chat/completions	\N	\N	{"method": "sync", "adapter": "gemini-chat", "endpointPath": "/chat/completions"}	{"chat": true, "vision": true}	{"pricing": {"unit": "token_usd_ratio", "currency": "credits", "creditsPerCny": 100}}	\N	\N	{"badge": "LLM", "label": "Gemini 3 Flash", "badgeColor": "#4285f4"}	gemini-3-flash
canvas-gemini-veo-video	canvas-provider-gemini-veo-video	veo-3.1-generate-preview	Gemini Veo 视频	VIDEO	second	0	25.2000	36	0.000000	0.000000	0.000000	0.000000	1.000000	ACTIVE	2026-05-16 01:25:39.963	gemini-video	/videos	/videos/{taskId}	object_storage	{"method": "async-poll", "adapter": "gemini-video", "uploadMode": "object_storage", "endpointPath": "/videos", "statusEndpointPath": "/videos/{taskId}"}	{"img2video": true, "txt2video": true}	{"pricing": {"unit": "second", "currency": "credits", "creditsPerCny": 100, "grossMarginRate": 0.3, "costCreditsPerSecond": 25.2, "chargedCreditsPerSecond": 36}}	{"durations": [4, 6, 8], "maxImages": {"full": 4, "firstLast": 2, "smartMultiFrame": 4}, "resolutions": ["720p", "1080p"], "aspectRatios": ["16:9", "9:16"], "supportsAudio": false, "supportsVideo": false, "defaultDuration": 8, "defaultResolution": "720p"}	\N	{"badge": "Veo", "label": "Gemini Veo 视频", "badgeColor": "#8b5cf6"}	veo-3-1-generate-preview
canvas-gemini-unified-image	canvas-provider-gemini-unified-image	gemini-3.1-flash-image-preview	Gemini 统一文生图	IMAGE	image_resolution_tier	5	3.5000	0	0.000000	0.000000	0.000000	0.000000	1.000000	ACTIVE	2026-05-16 01:25:39.959	gemini-image-generate	/images/generations	\N	object_storage	{"method": "sync", "adapter": "gemini-image-generate", "uploadMode": "object_storage", "endpointPath": "/images/generations"}	{"img2img": false, "txt2img": true, "panorama": false, "storyboard": true, "imageToImage": false}	{"size": "1024x1024", "pricing": {"unit": "image_resolution_tier", "tiers": [{"tier": "1K", "costCredits": 3.5, "chargedCredits": 5, "grossMarginRate": 0.3}, {"tier": "2K", "costCredits": 5.6, "chargedCredits": 8, "grossMarginRate": 0.3}, {"tier": "3K", "costCredits": 17.5, "chargedCredits": 25, "grossMarginRate": 0.3}, {"tier": "4K", "costCredits": 35, "chargedCredits": 50, "grossMarginRate": 0.3}], "currency": "credits", "creditsPerCny": 100}, "response_format": "b64_json"}	\N	\N	{"badge": "Gemini", "label": "Gemini 统一文生图", "badgeColor": "#4285f4"}	gemini-3-1-flash-image-preview
canvas-gemini-image	canvas-provider-gemini-image	gemini-3-pro-image-preview	Gemini-Image	IMAGE	image_resolution_tier	5	3.5000	0	0.000000	0.000000	0.000000	0.000000	1.000000	ACTIVE	2026-05-15 17:13:03.239	gemini-image	/v1beta/models/{model}:generateContent	\N	object_storage	{"method": "sync", "adapter": "gemini-image", "uploadMode": "object_storage", "endpointPath": "/v1beta/models/{model}:generateContent"}	{"img2img": true, "txt2img": true}	{"pricing": {"unit": "image_resolution_tier", "tiers": [{"tier": "1K", "costCredits": 3.5, "chargedCredits": 5, "grossMarginRate": 0.3}, {"tier": "2K", "costCredits": 5.6, "chargedCredits": 8, "grossMarginRate": 0.3}, {"tier": "3K", "costCredits": 17.5, "chargedCredits": 25, "grossMarginRate": 0.3}, {"tier": "4K", "costCredits": 35, "chargedCredits": 50, "grossMarginRate": 0.3}], "currency": "credits", "creditsPerCny": 100}, "imageSize": "2K"}	\N	\N	{"badge": "Gemini", "label": "Gemini-Image", "badgeColor": "#4285f4"}	\N
canvas-gemini-unified-image-edit	canvas-provider-gemini-unified-image-edit	gemini-3.1-flash-image-preview	Gemini 统一图生图	IMAGE	image_resolution_tier	5	3.5000	0	0.000000	0.000000	0.000000	0.000000	1.000000	ACTIVE	2026-05-16 01:25:39.955	gemini-image-edit	/images/edits	\N	object_storage	{"method": "sync", "adapter": "gemini-image-edit", "uploadMode": "object_storage", "endpointPath": "/images/edits"}	{"img2img": true, "txt2img": false, "panorama": false, "storyboard": true, "imageToImage": true}	{"size": "1024x1024", "pricing": {"unit": "image_resolution_tier", "tiers": [{"tier": "1K", "costCredits": 3.5, "chargedCredits": 5, "grossMarginRate": 0.3}, {"tier": "2K", "costCredits": 5.6, "chargedCredits": 8, "grossMarginRate": 0.3}, {"tier": "3K", "costCredits": 17.5, "chargedCredits": 25, "grossMarginRate": 0.3}, {"tier": "4K", "costCredits": 35, "chargedCredits": 50, "grossMarginRate": 0.3}], "currency": "credits", "creditsPerCny": 100}, "response_format": "b64_json"}	\N	\N	{"badge": "Gemini", "label": "Gemini 统一图生图", "badgeColor": "#0ea5e9"}	gemini-3-1-flash-image-preview
canvas-grok-video	canvas-provider-grok-video	grok-imagine-1.0-video	Grok 生视频	VIDEO	second	0	25.2000	36	0.000000	0.000000	0.000000	0.000000	1.000000	ACTIVE	2026-05-15 17:13:03.264	grok-video	/videos	\N	object_storage	{"method": "sync", "adapter": "grok-video", "uploadMode": "object_storage", "endpointPath": "/videos"}	{"img2video": true, "txt2video": true}	{"pricing": {"unit": "second", "currency": "credits", "creditsPerCny": 100, "grossMarginRate": 0.3, "costCreditsPerSecond": 25.2, "chargedCreditsPerSecond": 36}}	{"durations": [6, 10, 12, 15, 30], "maxImages": {"full": 4, "firstLast": 2, "smartMultiFrame": 4}, "resolutions": ["480p", "720p"], "aspectRatios": ["16:9", "9:16", "3:2", "2:3", "1:1"], "supportsAudio": false, "supportsVideo": false, "defaultDuration": 6, "defaultResolution": "720p"}	{"type": "passthrough"}	{"badge": "Grok", "label": "Grok 生视频", "badgeColor": "#7c3aed"}	grok-imagine-1-0-video
canvas-grok-image-edit	canvas-provider-grok-image-edit	grok-imagine-1.0-edit	Grok 图生图	IMAGE	image_resolution_tier	5	3.5000	0	0.000000	0.000000	0.000000	0.000000	1.000000	ACTIVE	2026-05-15 17:13:03.255	grok-image-edit	/images/edits	\N	object_storage	{"method": "sync", "adapter": "grok-image-edit", "uploadMode": "object_storage", "endpointPath": "/images/edits"}	{"img2img": true, "txt2img": false, "panorama": false, "storyboard": true, "imageToImage": true}	{"size": "1024x1024", "pricing": {"unit": "image_resolution_tier", "tiers": [{"tier": "1K", "costCredits": 3.5, "chargedCredits": 5, "grossMarginRate": 0.3}, {"tier": "2K", "costCredits": 5.6, "chargedCredits": 8, "grossMarginRate": 0.3}, {"tier": "3K", "costCredits": 17.5, "chargedCredits": 25, "grossMarginRate": 0.3}, {"tier": "4K", "costCredits": 35, "chargedCredits": 50, "grossMarginRate": 0.3}], "currency": "credits", "creditsPerCny": 100}}	\N	\N	{"badge": "Grok", "label": "Grok 图生图", "badgeColor": "#0f766e"}	grok-imagine-1-0-edit
canvas-gemini-pro-image	canvas-provider-gemini-pro-image	gemini-3-pro-image-preview	Gemini Pro 文生图	IMAGE	image_resolution_tier	5	3.5000	0	0.000000	0.000000	0.000000	0.000000	1.000000	ACTIVE	2026-05-16 01:42:43.152	gemini-image-generate	/images/generations	\N	object_storage	{"method": "sync", "adapter": "gemini-image-generate", "uploadMode": "object_storage", "endpointPath": "/images/generations"}	{"img2img": false, "txt2img": true, "panorama": false, "storyboard": true, "imageToImage": false}	{"pricing": {"unit": "image_resolution_tier", "tiers": [{"tier": "1K", "costCredits": 3.5, "chargedCredits": 5, "grossMarginRate": 0.3}, {"tier": "2K", "costCredits": 5.6, "chargedCredits": 8, "grossMarginRate": 0.3}, {"tier": "3K", "costCredits": 17.5, "chargedCredits": 25, "grossMarginRate": 0.3}, {"tier": "4K", "costCredits": 35, "chargedCredits": 50, "grossMarginRate": 0.3}], "currency": "credits", "creditsPerCny": 100}}	\N	\N	{"badge": "Pro", "label": "Gemini Pro 文生图", "badgeColor": "#7c3aed"}	gemini-3-pro-image-preview
canvas-gemini-pro-image-edit	canvas-provider-gemini-pro-image-edit	gemini-3-pro-image-preview	Gemini Pro 图生图	IMAGE	image_resolution_tier	5	3.5000	0	0.000000	0.000000	0.000000	0.000000	1.000000	ACTIVE	2026-05-16 01:42:43.146	gemini-image-edit	/images/edits	\N	object_storage	{"method": "sync", "adapter": "gemini-image-edit", "uploadMode": "object_storage", "endpointPath": "/images/edits"}	{"img2img": true, "txt2img": false, "panorama": false, "storyboard": true, "imageToImage": true}	{"pricing": {"unit": "image_resolution_tier", "tiers": [{"tier": "1K", "costCredits": 3.5, "chargedCredits": 5, "grossMarginRate": 0.3}, {"tier": "2K", "costCredits": 5.6, "chargedCredits": 8, "grossMarginRate": 0.3}, {"tier": "3K", "costCredits": 17.5, "chargedCredits": 25, "grossMarginRate": 0.3}, {"tier": "4K", "costCredits": 35, "chargedCredits": 50, "grossMarginRate": 0.3}], "currency": "credits", "creditsPerCny": 100}}	\N	\N	{"badge": "Pro", "label": "Gemini Pro 图生图", "badgeColor": "#6d28d9"}	gemini-3-pro-image-preview
canvas-gemini-pro-llm	canvas-provider-gemini-pro-llm	gemini-3-pro	Gemini 3 Pro	LLM	token_usd_ratio	0	0.0000	0	0.000000	0.000000	0.000000	0.000000	1.000000	ACTIVE	2026-05-16 01:42:43.155	gemini-chat	/chat/completions	\N	\N	{"method": "sync", "adapter": "gemini-chat", "endpointPath": "/chat/completions"}	{"chat": true, "vision": true}	{"pricing": {"unit": "token_usd_ratio", "currency": "credits", "creditsPerCny": 100}}	\N	\N	{"badge": "LLM", "label": "Gemini 3 Pro", "badgeColor": "#7c3aed"}	gemini-3-pro
\.


--
-- Data for Name: canvas_workflows; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.canvas_workflows (id, user_id, name, data_json, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: commission_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.commission_logs (id, agent_id, user_id, source_type, source_id, redemption_id, amount, status, settled_at, created_at) FROM stdin;
\.


--
-- Data for Name: generation_refunds; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.generation_refunds (id, task_id, user_id, amount, status, source, reason, operator_id, created_at, processed_at) FROM stdin;
\.


--
-- Data for Name: generation_tasks; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.generation_tasks (id, user_id, provider_id, model_id, channel_key, type, mode, status, prompt, negative_prompt, input_files_json, params_json, request_json, response_json, upstream_task_id, upstream_request_id, result_json, result_urls_json, charged_credits, cost_amount, cost_usd, refund_credits, refund_status, refund_reason, error_code, error_message, retry_count, progress, started_at, completed_at, failed_at, refunded_at, created_at, updated_at, client_request_id) FROM stdin;
\.


--
-- Data for Name: member_accounts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.member_accounts (id, code, plan_id, status, claimed_agent_id, claimed_at, redeemed_user_id, redeemed_at, created_at) FROM stdin;
\.


--
-- Data for Name: membership_plans; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.membership_plans (id, name, price, duration_days, status) FROM stdin;
seed-monthly-plan	月度会员	0	30	ACTIVE
\.


--
-- Data for Name: model_usages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.model_usages (id, user_id, model_id, model_type, quantity, duration_seconds, sale_amount, cost_amount, input_tokens, output_tokens, total_tokens, cost_usd, charged_credits, status, prompt, request_json, response_json, result_url, request_id, upstream_task_id, error_message, created_at) FROM stdin;
\.


--
-- Data for Name: provider_health_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.provider_health_logs (id, provider_id, model_id, task_id, status, latency_ms, error_code, error_message, created_at) FROM stdin;
\.


--
-- Data for Name: recharge_orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.recharge_orders (id, order_no, user_id, channel, status, amount_cents, credits, qr_code, payment_trade_no, notify_payload, paid_at, expired_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: settlements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.settlements (id, agent_id, amount, status, remark, created_at, settled_at) FROM stdin;
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.system_settings (id, key, label, setting_group, value, value_type, is_secret, remark, created_at, updated_at) FROM stdin;
setting-upstream-timeout-ms	upstream.timeout_ms	上游超时毫秒	generation	600000	NUMBER	f	\N	2026-05-14 11:54:16.836	2026-05-14 11:54:16.836
cmp73sbb30000tg56oj79bifb	recharge.credits_per_cny	每元充值积分	payment	100	NUMBER	f	\N	2026-05-15 15:59:51.614	2026-05-15 16:02:01.146
cmoxs7ls30001tg7z8skoqn6x	generation.mock_mode	生成 Mock 模式	generation	false	BOOLEAN	f	\N	2026-05-09 03:25:54.052	2026-05-16 02:48:50.969
cmoxs7ls10000tg7zxrs5f34e	payment.mode	支付模式	payment	alipay	STRING	f	mock 或 alipay	2026-05-09 03:25:54.049	2026-05-16 02:48:50.975
\.


--
-- Data for Name: trial_cards; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.trial_cards (id, code, agent_id, plan_id, status, expired_at, used_user_id, used_at) FROM stdin;
\.


--
-- Data for Name: upstream_providers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.upstream_providers (id, name, base_url, api_key_encrypted, status, created_at, provider_key, type, adapter, endpoint_path, status_endpoint_path, upload_mode, request_method, default_model, default_params, timeout_ms, weight, concurrency_limit, failure_threshold) FROM stdin;
cmoxv7iob0000tg56i4edfsb9	GPT 5.5 渠道	http://localhost:8317/v1	NwBLPujQzWBK+jOR.0uZBZHhrIOVhh9x2eb7LkQ==.6PwU0GBHVLba8xIJJVjTQRSW3BJ9IdU04wFQNnTfv7AuEifYmJ1RpyoWtzMFFCf0baY/	ACTIVE	2026-05-09 04:49:48.875	_cli_proxy_llm_cmoxv7io	LLM	openai-chat	/chat/completions	\N	\N	sync	gpt-5.5	\N	60000	100	0	5
cmp3ppfg20000tg86epxnornm	gemini-3-pro 渠道	https://socdabat.it.com	1O8diLNIBDyaLS6e.Ki28sXmZjbfu/nI0cXxsEQ==.sjbM1bxF3Gy9BvltTevTqjVUwgXqzUOiyTJeG3wdqRSt33HPTseEjUJGVt+5SGK3sVVz	ACTIVE	2026-05-13 07:02:23.858	model_gemini-3-pro_mp3ppfg1	IMAGE	gemini-image	/v1beta/models/{model}:generateContent	\N	object_storage	sync	gemini-3-pro-image-preview	\N	600000	100	0	5
canvas-provider-gpt-image-2-pro	画布渠道 GPT-Image-2-pro	http://localhost:8317/v1	qz+u9SDjcghsf2P4.eFzl2zWFlwXwldfcnZdKjQ==.p7j0zjSZzXE/voYoQpPhHGfIFPnk5so6AGrrrYoG0lcpqOG1TMVUyc/mOxFlalsp/8xd	ACTIVE	2026-05-09 05:32:10.745	canvas_gpt-image-2-pro	IMAGE	openai-edits	/images/edits	\N	files	\N	gpt-image-2	\N	600000	100	0	5
canvas-provider-sora-2	画布渠道 sora-2	https://notevideo.asia/v1	oC9hyfebR3W/pZ1o.nSwnWEjA7hUPwY7ROjEbjg==.x8HVLBQ90p6VHyk3/2/3jJLDh/rH0iGL2Tq/b0hjuj7JIJ0x40A5wrvFNO0APA/SAcQc	ACTIVE	2026-05-09 05:32:10.753	canvas_sora-2	VIDEO	notevideo	/videos	/videos/{taskId}	\N	async-poll	sora-2	\N	600000	100	0	5
canvas-provider-sora-v3-pro	画布渠道 sora-v3-pro	https://notevideo.asia/v1	qTNuAl/1/NrY8HC1.iACDwiXEEzgkAxwhYIS+hw==.59nZhBhJfO4FwpstH5spP1N11jTgQcNIhR1IKQsFJN2Avvc5ox6dxE6a6eEWrIz65X5M	ACTIVE	2026-05-09 05:32:10.758	canvas_sora-v3-pro	VIDEO	notevideo	/videos	/videos/{taskId}	\N	async-poll	sora-v3-pro	\N	600000	100	0	5
canvas-provider-sora-v3-vip	画布渠道 sora-v3-vip	https://notevideo.asia/v1	UC3W1PiWOqDJoyW4.Q4hWt48jAGm2SdFd4h9WtQ==.Uekaas4tywJGb1ihY4XPYADWW2hZD+OhGeyVbfql9woXRHZx+QtczqqXRjSfQM8LzvBQ	ACTIVE	2026-05-09 05:32:10.76	canvas_sora-v3-vip	VIDEO	notevideo	/videos	/videos/{taskId}	\N	async-poll	sora-v3-vip	\N	600000	100	0	5
canvas-provider-gemini-unified-image	画布渠道 Gemini 统一文生图	http://127.0.0.1:8000/v1	Gb9dnbJ+6FUGif7t.+YSwEm0Lb+6nsab1BAN2WA==.UNHYFROzwGA0UXXPd/9CVQ==	ACTIVE	2026-05-16 01:25:39.958	canvas_gemini-unified-image	IMAGE	gemini-image-generate	/images/generations	\N	object_storage	sync	gemini-3.1-flash-image-preview	\N	60000	100	0	5
cmp5rj48d000etgkjl44od5dk	sora-v3-fast 渠道	https://socdabat.it.com/v1	3y8pIGE5e72gRkX6.A8CA9pnE5I3KQcl22spyyg==.nG2O+BN+Hgb+doTvgMz/MPRnNOaNQuRzdp0JnvxyQH3EWeB/hI8sqwRLxoIGbJa9F90t	ACTIVE	2026-05-14 17:29:00.974	model_sora-v3-fast_mp5rj48c	VIDEO	notevideo	/videos	/videos/{taskId}	\N	async-poll	sora-v3-fast	\N	60000	100	0	5
cmp5ue4vk0006tgh6w1u032cw	gpt-5.4 渠道	http://localhost:8317/v1	1Q8eWFNivDI35woY.243W1MHecE9fvyETxIWB+g==.w1Qr4Q99D17+UFxnZ7MwuyECvCqodX+aBWZ7iCp1VGTdIrEsmA9bNmQJM7seIz4sjEEP	ACTIVE	2026-05-14 18:49:07.377	model_gpt-5-4_mp5ue4vk	LLM	openai-chat	/chat/completions	\N	\N	sync	gpt-5.4	\N	60000	100	0	5
canvas-provider-grok-video	画布渠道 Grok 生视频	http://127.0.0.1:8000/v1	raeDB+2/idleDHGk.SxieofKZVOtDizNMM6K5fw==.OlzdjYpMHyoRZAMH67rQrg==	ACTIVE	2026-05-15 17:13:03.263	canvas_grok-video	VIDEO	grok-video	/videos	\N	object_storage	sync	grok-imagine-1.0-video	\N	60000	100	0	5
canvas-provider-gpt-image-v2	画布渠道 GPT-Image-V2	https://socdabat.it.com/v1	/cOpG5cyC1QuNv+Y.LLE9C5jeQXtAdaEhBTvQ6A==.T4sEegIYQnzf+PFrpKoSKNTKag2UNmLa7DGRODquTXsSW71VzlHHXio6gHWiP7qV+KoI	ACTIVE	2026-05-09 05:32:10.749	canvas_gpt-image-v2	IMAGE	gpt-image-v2	/images/generations	\N	object_storage	sync	gpt-image-2	\N	600000	100	0	5
canvas-provider-gemini-image	画布渠道 Gemini-Image	https://socdabat.it.com	zfHyclSpQSOGKv0J.+TuCtkOT/ac1ufrUHsXOYw==.iGTozD5CyGqORwzvxjbSb00Eymh/K2b+cwT+B0nNgsMJ5wdL5wtxDjoNYm9yuE/s8C+8	ACTIVE	2026-05-15 17:13:03.228	canvas_gemini-image	IMAGE	gemini-image	/v1beta/models/{model}:generateContent	\N	object_storage	sync	gemini-3-pro-image-preview	\N	60000	100	0	5
canvas-provider-gemini-pro-image	Gemini Pro 文生图 渠道	http://127.0.0.1:8000/v1	NJ9p+9cPSE3CVr3+.FsIZepW2HbMo8EEzY9T6GQ==.35MaDhAq0J6qBcpBP4G8Mw==	ACTIVE	2026-05-16 01:42:43.149	canvas_gemini-pro-image	IMAGE	gemini-image-generate	/images/generations	\N	object_storage	sync	gemini-3-pro-image-preview	\N	60000	100	0	5
canvas-provider-gemini-pro-image-edit	Gemini Pro 图生图 渠道	http://127.0.0.1:8000/v1	QPARoDnNg1HLNj2t.g3sAnt75KkBU2idcgIV/+A==.nwf6QDTva6HWSyGRcefvDw==	ACTIVE	2026-05-16 01:42:43.142	canvas_gemini-pro-image-edit	IMAGE	gemini-image-edit	/images/edits	\N	object_storage	sync	gemini-3-pro-image-preview	\N	60000	100	0	5
canvas-provider-gemini-veo-video	画布渠道 Gemini Veo 视频	http://127.0.0.1:8000/v1	T9O7g5XM+38VIVSJ.tGs8kGii5q+ZQ9Onj3tCiw==.mbuJuY6NATXuzj+6tOGVSQ==	ACTIVE	2026-05-16 01:25:39.962	canvas_gemini-veo-video	VIDEO	gemini-video	/videos	/videos/{taskId}	object_storage	async-poll	veo-3.1-generate-preview	\N	60000	100	0	5
canvas-provider-gemini-pro-llm	Gemini 3 Pro 渠道	http://127.0.0.1:8000/v1	HvSj6suJVEdyxM+b.pRSqgNewTzs1lcg5OhDj7A==.Hs+EoTJyE3rYLiR+ZbI37Q==	ACTIVE	2026-05-16 01:42:43.154	canvas_gemini-pro-llm	LLM	gemini-chat	/chat/completions	\N	\N	sync	gemini-3-pro	\N	60000	100	0	5
canvas-provider-gemini-llm	画布渠道 Gemini 3 Flash	http://127.0.0.1:8000/v1	MavEH3LOqM0yiLCf.3rnOhRluB7Gi0qWUiScMkg==.cXaUFjyIGJ8EL9571I6new==	ACTIVE	2026-05-16 01:25:39.947	canvas_gemini-llm	LLM	gemini-chat	/chat/completions	\N	\N	sync	gemini-3-flash	\N	60000	100	0	5
canvas-provider-grok-image-edit	画布渠道 Grok 图生图	http://127.0.0.1:8000/v1	nAmXCmBRz5qZppYl.QBCMFDNtBrh+ouMISI0vTg==.sIeL+ss5spP1X07Un4Bf9g==	ACTIVE	2026-05-15 17:13:03.254	canvas_grok-image-edit	IMAGE	grok-image-edit	/images/edits	\N	object_storage	sync	grok-imagine-1.0-edit	\N	60000	100	0	5
canvas-provider-gemini-unified-image-edit	画布渠道 Gemini 统一图生图	http://127.0.0.1:8000/v1	obiVasHKSh6ShYBw.ykGGarcluc78mlD2b/jWvQ==.CmrNzoUclWmz8NwC9zIohA==	ACTIVE	2026-05-16 01:25:39.954	canvas_gemini-unified-image-edit	IMAGE	gemini-image-edit	/images/edits	\N	object_storage	sync	gemini-3.1-flash-image-preview	\N	60000	100	0	5
canvas-provider-grok-image	画布渠道 Grok 文生图	http://127.0.0.1:8000/v1	jc5vaKTs4Ec/2Ll3.ApQh49IzsWUsErtgiLqL5w==.PMPQ3X9CaIf4xj4BEXeOew==	ACTIVE	2026-05-15 17:13:03.258	canvas_grok-image	IMAGE	grok-image	/images/generations	\N	object_storage	sync	grok-imagine-1.0	\N	60000	100	0	5
canvas-provider-grok-llm	画布渠道 Grok-4	http://127.0.0.1:8000/v1	UF7Kw97M01tgbbkH.a8zZ6TSg5dE7NQyTkUGleA==.SXW8as238hABSBkqg0EtVA==	ACTIVE	2026-05-15 17:13:03.26	canvas_grok-llm	LLM	grok-chat	/chat/completions	\N	\N	sync	grok-4	\N	60000	100	0	5
\.


--
-- Data for Name: user_memberships; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_memberships (id, user_id, plan_id, started_at, expired_at, source) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, phone, email, password_hash, nickname, role, status, agent_id, created_at, updated_at) FROM stdin;
cmox7ixjh0000tgqynxxg1t3t	13800000000	\N	$2a$10$mssw.hIEyCXFUXctIaF3B.3ugH3lrSPbIx5Jk3tf2r8Bi1LRIF2aq	超级管理员	SUPER_ADMIN	ACTIVE	\N	2026-05-08 17:46:50.573	2026-05-11 17:36:58.237
cmp5unay6000dtgh6lqdgxfye	134 8013 4027	492170452@qq.com	$2a$10$5DVVPOZ4lbMjpGwuze.dfePUOzfpAlQrkndrNpNsZ8QJDjuoC5oUa	Billy	AGENT	ACTIVE	\N	2026-05-14 18:56:15.151	2026-05-14 18:56:46.481
\.


--
-- Data for Name: wallet_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.wallet_logs (id, user_id, type, amount, balance_before, balance_after, related_type, related_id, remark, created_at) FROM stdin;
\.


--
-- Data for Name: wallets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.wallets (id, user_id, balance, created_at, updated_at) FROM stdin;
cmp7r4i1h0001tg9kbhi9ahrz	cmox7ixjh0000tgqynxxg1t3t	0	2026-05-16 02:53:11.382	2026-05-16 02:53:11.382
cmp7r4i1m0003tg9ks4lj5tjw	cmp5unay6000dtgh6lqdgxfye	0	2026-05-16 02:53:11.387	2026-05-16 02:53:11.387
\.


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: account_claims account_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_claims
    ADD CONSTRAINT account_claims_pkey PRIMARY KEY (id);


--
-- Name: account_redemptions account_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_redemptions
    ADD CONSTRAINT account_redemptions_pkey PRIMARY KEY (id);


--
-- Name: admin_logs admin_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_pkey PRIMARY KEY (id);


--
-- Name: agent_credit_accounts agent_credit_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_credit_accounts
    ADD CONSTRAINT agent_credit_accounts_pkey PRIMARY KEY (id);


--
-- Name: agent_credit_ledgers agent_credit_ledgers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_credit_ledgers
    ADD CONSTRAINT agent_credit_ledgers_pkey PRIMARY KEY (id);


--
-- Name: agent_credit_voucher_requests agent_credit_voucher_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_credit_voucher_requests
    ADD CONSTRAINT agent_credit_voucher_requests_pkey PRIMARY KEY (id);


--
-- Name: agent_credit_vouchers agent_credit_vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_credit_vouchers
    ADD CONSTRAINT agent_credit_vouchers_pkey PRIMARY KEY (id);


--
-- Name: agent_customers agent_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_customers
    ADD CONSTRAINT agent_customers_pkey PRIMARY KEY (id);


--
-- Name: agent_reconciliation_orders agent_reconciliation_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_reconciliation_orders
    ADD CONSTRAINT agent_reconciliation_orders_pkey PRIMARY KEY (id);


--
-- Name: agents agents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_pkey PRIMARY KEY (id);


--
-- Name: ai_models ai_models_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_models
    ADD CONSTRAINT ai_models_pkey PRIMARY KEY (id);


--
-- Name: canvas_workflows canvas_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.canvas_workflows
    ADD CONSTRAINT canvas_workflows_pkey PRIMARY KEY (id);


--
-- Name: commission_logs commission_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.commission_logs
    ADD CONSTRAINT commission_logs_pkey PRIMARY KEY (id);


--
-- Name: generation_refunds generation_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.generation_refunds
    ADD CONSTRAINT generation_refunds_pkey PRIMARY KEY (id);


--
-- Name: generation_tasks generation_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.generation_tasks
    ADD CONSTRAINT generation_tasks_pkey PRIMARY KEY (id);


--
-- Name: member_accounts member_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_accounts
    ADD CONSTRAINT member_accounts_pkey PRIMARY KEY (id);


--
-- Name: membership_plans membership_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.membership_plans
    ADD CONSTRAINT membership_plans_pkey PRIMARY KEY (id);


--
-- Name: model_usages model_usages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.model_usages
    ADD CONSTRAINT model_usages_pkey PRIMARY KEY (id);


--
-- Name: provider_health_logs provider_health_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.provider_health_logs
    ADD CONSTRAINT provider_health_logs_pkey PRIMARY KEY (id);


--
-- Name: recharge_orders recharge_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recharge_orders
    ADD CONSTRAINT recharge_orders_pkey PRIMARY KEY (id);


--
-- Name: settlements settlements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.settlements
    ADD CONSTRAINT settlements_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: trial_cards trial_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trial_cards
    ADD CONSTRAINT trial_cards_pkey PRIMARY KEY (id);


--
-- Name: upstream_providers upstream_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.upstream_providers
    ADD CONSTRAINT upstream_providers_pkey PRIMARY KEY (id);


--
-- Name: user_memberships user_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_memberships
    ADD CONSTRAINT user_memberships_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: wallet_logs wallet_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_logs
    ADD CONSTRAINT wallet_logs_pkey PRIMARY KEY (id);


--
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);


--
-- Name: account_redemptions_account_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX account_redemptions_account_id_key ON public.account_redemptions USING btree (account_id);


--
-- Name: account_redemptions_agent_id_redeemed_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX account_redemptions_agent_id_redeemed_at_idx ON public.account_redemptions USING btree (agent_id, redeemed_at);


--
-- Name: admin_logs_admin_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX admin_logs_admin_user_id_created_at_idx ON public.admin_logs USING btree (admin_user_id, created_at);


--
-- Name: agent_credit_accounts_agent_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX agent_credit_accounts_agent_id_key ON public.agent_credit_accounts USING btree (agent_id);


--
-- Name: agent_credit_ledgers_agent_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX agent_credit_ledgers_agent_id_created_at_idx ON public.agent_credit_ledgers USING btree (agent_id, created_at);


--
-- Name: agent_credit_voucher_requests_agent_id_status_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX agent_credit_voucher_requests_agent_id_status_created_at_idx ON public.agent_credit_voucher_requests USING btree (agent_id, status, created_at);


--
-- Name: agent_credit_voucher_requests_reconciliation_order_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX agent_credit_voucher_requests_reconciliation_order_id_key ON public.agent_credit_voucher_requests USING btree (reconciliation_order_id);


--
-- Name: agent_credit_voucher_requests_request_no_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX agent_credit_voucher_requests_request_no_key ON public.agent_credit_voucher_requests USING btree (request_no);


--
-- Name: agent_credit_voucher_requests_status_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX agent_credit_voucher_requests_status_created_at_idx ON public.agent_credit_voucher_requests USING btree (status, created_at);


--
-- Name: agent_credit_voucher_requests_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX agent_credit_voucher_requests_user_id_created_at_idx ON public.agent_credit_voucher_requests USING btree (user_id, created_at);


--
-- Name: agent_credit_voucher_requests_voucher_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX agent_credit_voucher_requests_voucher_id_key ON public.agent_credit_voucher_requests USING btree (voucher_id);


--
-- Name: agent_credit_vouchers_agent_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX agent_credit_vouchers_agent_id_created_at_idx ON public.agent_credit_vouchers USING btree (agent_id, created_at);


--
-- Name: agent_credit_vouchers_code_hash_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX agent_credit_vouchers_code_hash_key ON public.agent_credit_vouchers USING btree (code_hash);


--
-- Name: agent_credit_vouchers_recharge_order_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX agent_credit_vouchers_recharge_order_id_key ON public.agent_credit_vouchers USING btree (recharge_order_id);


--
-- Name: agent_credit_vouchers_user_id_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX agent_credit_vouchers_user_id_status_idx ON public.agent_credit_vouchers USING btree (user_id, status);


--
-- Name: agent_credit_vouchers_voucher_no_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX agent_credit_vouchers_voucher_no_key ON public.agent_credit_vouchers USING btree (voucher_no);


--
-- Name: agent_customers_agent_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX agent_customers_agent_id_created_at_idx ON public.agent_customers USING btree (agent_id, created_at);


--
-- Name: agent_customers_customer_phone_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX agent_customers_customer_phone_key ON public.agent_customers USING btree (customer_phone);


--
-- Name: agent_customers_user_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX agent_customers_user_id_key ON public.agent_customers USING btree (user_id);


--
-- Name: agent_reconciliation_orders_agent_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX agent_reconciliation_orders_agent_id_created_at_idx ON public.agent_reconciliation_orders USING btree (agent_id, created_at);


--
-- Name: agent_reconciliation_orders_order_no_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX agent_reconciliation_orders_order_no_key ON public.agent_reconciliation_orders USING btree (order_no);


--
-- Name: agent_reconciliation_orders_status_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX agent_reconciliation_orders_status_created_at_idx ON public.agent_reconciliation_orders USING btree (status, created_at);


--
-- Name: agents_user_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX agents_user_id_key ON public.agents USING btree (user_id);


--
-- Name: ai_models_provider_id_model_key_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_models_provider_id_model_key_idx ON public.ai_models USING btree (provider_id, model_key);


--
-- Name: ai_models_type_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ai_models_type_status_idx ON public.ai_models USING btree (type, status);


--
-- Name: canvas_workflows_user_id_updated_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX canvas_workflows_user_id_updated_at_idx ON public.canvas_workflows USING btree (user_id, updated_at);


--
-- Name: commission_logs_agent_id_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX commission_logs_agent_id_status_idx ON public.commission_logs USING btree (agent_id, status);


--
-- Name: generation_refunds_task_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX generation_refunds_task_id_created_at_idx ON public.generation_refunds USING btree (task_id, created_at);


--
-- Name: generation_refunds_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX generation_refunds_user_id_created_at_idx ON public.generation_refunds USING btree (user_id, created_at);


--
-- Name: generation_tasks_channel_key_status_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX generation_tasks_channel_key_status_created_at_idx ON public.generation_tasks USING btree (channel_key, status, created_at);


--
-- Name: generation_tasks_type_status_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX generation_tasks_type_status_created_at_idx ON public.generation_tasks USING btree (type, status, created_at);


--
-- Name: generation_tasks_user_id_client_request_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX generation_tasks_user_id_client_request_id_key ON public.generation_tasks USING btree (user_id, client_request_id);


--
-- Name: generation_tasks_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX generation_tasks_user_id_created_at_idx ON public.generation_tasks USING btree (user_id, created_at);


--
-- Name: member_accounts_code_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX member_accounts_code_key ON public.member_accounts USING btree (code);


--
-- Name: member_accounts_status_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX member_accounts_status_created_at_idx ON public.member_accounts USING btree (status, created_at);


--
-- Name: model_usages_model_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX model_usages_model_id_created_at_idx ON public.model_usages USING btree (model_id, created_at);


--
-- Name: model_usages_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX model_usages_user_id_created_at_idx ON public.model_usages USING btree (user_id, created_at);


--
-- Name: provider_health_logs_provider_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX provider_health_logs_provider_id_created_at_idx ON public.provider_health_logs USING btree (provider_id, created_at);


--
-- Name: provider_health_logs_status_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX provider_health_logs_status_created_at_idx ON public.provider_health_logs USING btree (status, created_at);


--
-- Name: recharge_orders_order_no_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX recharge_orders_order_no_key ON public.recharge_orders USING btree (order_no);


--
-- Name: recharge_orders_status_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX recharge_orders_status_created_at_idx ON public.recharge_orders USING btree (status, created_at);


--
-- Name: recharge_orders_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX recharge_orders_user_id_created_at_idx ON public.recharge_orders USING btree (user_id, created_at);


--
-- Name: system_settings_key_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX system_settings_key_key ON public.system_settings USING btree (key);


--
-- Name: system_settings_setting_group_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX system_settings_setting_group_idx ON public.system_settings USING btree (setting_group);


--
-- Name: trial_cards_code_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX trial_cards_code_key ON public.trial_cards USING btree (code);


--
-- Name: upstream_providers_adapter_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX upstream_providers_adapter_status_idx ON public.upstream_providers USING btree (adapter, status);


--
-- Name: upstream_providers_provider_key_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX upstream_providers_provider_key_key ON public.upstream_providers USING btree (provider_key);


--
-- Name: user_memberships_user_id_expired_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_memberships_user_id_expired_at_idx ON public.user_memberships USING btree (user_id, expired_at);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: users_phone_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX users_phone_key ON public.users USING btree (phone);


--
-- Name: wallet_logs_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX wallet_logs_user_id_created_at_idx ON public.wallet_logs USING btree (user_id, created_at);


--
-- Name: wallets_user_id_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX wallets_user_id_key ON public.wallets USING btree (user_id);


--
-- Name: account_claims account_claims_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_claims
    ADD CONSTRAINT account_claims_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: account_redemptions account_redemptions_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_redemptions
    ADD CONSTRAINT account_redemptions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.member_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: account_redemptions account_redemptions_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_redemptions
    ADD CONSTRAINT account_redemptions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: account_redemptions account_redemptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_redemptions
    ADD CONSTRAINT account_redemptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.membership_plans(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: account_redemptions account_redemptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.account_redemptions
    ADD CONSTRAINT account_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: admin_logs admin_logs_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: agent_credit_accounts agent_credit_accounts_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_credit_accounts
    ADD CONSTRAINT agent_credit_accounts_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: agent_credit_ledgers agent_credit_ledgers_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_credit_ledgers
    ADD CONSTRAINT agent_credit_ledgers_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: agent_credit_voucher_requests agent_credit_voucher_requests_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_credit_voucher_requests
    ADD CONSTRAINT agent_credit_voucher_requests_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: agent_credit_voucher_requests agent_credit_voucher_requests_reconciliation_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_credit_voucher_requests
    ADD CONSTRAINT agent_credit_voucher_requests_reconciliation_order_id_fkey FOREIGN KEY (reconciliation_order_id) REFERENCES public.agent_reconciliation_orders(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: agent_credit_voucher_requests agent_credit_voucher_requests_reviewed_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_credit_voucher_requests
    ADD CONSTRAINT agent_credit_voucher_requests_reviewed_by_admin_id_fkey FOREIGN KEY (reviewed_by_admin_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: agent_credit_voucher_requests agent_credit_voucher_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_credit_voucher_requests
    ADD CONSTRAINT agent_credit_voucher_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: agent_credit_voucher_requests agent_credit_voucher_requests_voucher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_credit_voucher_requests
    ADD CONSTRAINT agent_credit_voucher_requests_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES public.agent_credit_vouchers(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: agent_credit_vouchers agent_credit_vouchers_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_credit_vouchers
    ADD CONSTRAINT agent_credit_vouchers_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: agent_credit_vouchers agent_credit_vouchers_recharge_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_credit_vouchers
    ADD CONSTRAINT agent_credit_vouchers_recharge_order_id_fkey FOREIGN KEY (recharge_order_id) REFERENCES public.recharge_orders(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: agent_credit_vouchers agent_credit_vouchers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_credit_vouchers
    ADD CONSTRAINT agent_credit_vouchers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: agent_customers agent_customers_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_customers
    ADD CONSTRAINT agent_customers_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: agent_customers agent_customers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_customers
    ADD CONSTRAINT agent_customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: agent_reconciliation_orders agent_reconciliation_orders_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_reconciliation_orders
    ADD CONSTRAINT agent_reconciliation_orders_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: agent_reconciliation_orders agent_reconciliation_orders_confirmed_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agent_reconciliation_orders
    ADD CONSTRAINT agent_reconciliation_orders_confirmed_by_admin_id_fkey FOREIGN KEY (confirmed_by_admin_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: agents agents_parent_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_parent_agent_id_fkey FOREIGN KEY (parent_agent_id) REFERENCES public.agents(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: agents agents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.agents
    ADD CONSTRAINT agents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ai_models ai_models_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_models
    ADD CONSTRAINT ai_models_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.upstream_providers(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: canvas_workflows canvas_workflows_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.canvas_workflows
    ADD CONSTRAINT canvas_workflows_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: commission_logs commission_logs_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.commission_logs
    ADD CONSTRAINT commission_logs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: commission_logs commission_logs_redemption_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.commission_logs
    ADD CONSTRAINT commission_logs_redemption_id_fkey FOREIGN KEY (redemption_id) REFERENCES public.account_redemptions(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: generation_refunds generation_refunds_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.generation_refunds
    ADD CONSTRAINT generation_refunds_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.generation_tasks(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: generation_refunds generation_refunds_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.generation_refunds
    ADD CONSTRAINT generation_refunds_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: generation_tasks generation_tasks_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.generation_tasks
    ADD CONSTRAINT generation_tasks_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.ai_models(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: generation_tasks generation_tasks_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.generation_tasks
    ADD CONSTRAINT generation_tasks_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.upstream_providers(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: generation_tasks generation_tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.generation_tasks
    ADD CONSTRAINT generation_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: member_accounts member_accounts_claimed_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_accounts
    ADD CONSTRAINT member_accounts_claimed_agent_id_fkey FOREIGN KEY (claimed_agent_id) REFERENCES public.agents(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: member_accounts member_accounts_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.member_accounts
    ADD CONSTRAINT member_accounts_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.membership_plans(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: model_usages model_usages_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.model_usages
    ADD CONSTRAINT model_usages_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.ai_models(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: model_usages model_usages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.model_usages
    ADD CONSTRAINT model_usages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: provider_health_logs provider_health_logs_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.provider_health_logs
    ADD CONSTRAINT provider_health_logs_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.ai_models(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: provider_health_logs provider_health_logs_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.provider_health_logs
    ADD CONSTRAINT provider_health_logs_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.upstream_providers(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: provider_health_logs provider_health_logs_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.provider_health_logs
    ADD CONSTRAINT provider_health_logs_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.generation_tasks(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: recharge_orders recharge_orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recharge_orders
    ADD CONSTRAINT recharge_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: settlements settlements_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.settlements
    ADD CONSTRAINT settlements_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: trial_cards trial_cards_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trial_cards
    ADD CONSTRAINT trial_cards_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: trial_cards trial_cards_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trial_cards
    ADD CONSTRAINT trial_cards_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.membership_plans(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: trial_cards trial_cards_used_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.trial_cards
    ADD CONSTRAINT trial_cards_used_user_id_fkey FOREIGN KEY (used_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: user_memberships user_memberships_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_memberships
    ADD CONSTRAINT user_memberships_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.membership_plans(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: user_memberships user_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_memberships
    ADD CONSTRAINT user_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: users users_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: wallet_logs wallet_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_logs
    ADD CONSTRAINT wallet_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: wallets wallets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallets
    ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict g33ml62k1kiQYdtQybInlHiVD6Qd4tSkgfCjcX39SpBTdFHHWPNH5W0R11pQvSx

