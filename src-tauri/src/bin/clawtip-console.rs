use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use serde::Serialize;
use tokens_buddy_lib::clawtip::{
    config::{default_config_path, write_clawtip_config, ClawtipConfigInit},
    credential::{create_mock_pay_credential, verify_pay_credential_for_order},
    crypto::encrypt_clawtip_order_data_base64,
    fulfillment::{ClawtipFulfillmentResult, LocalFulfillmentStore},
    listing::ListingStatus,
    listing::{ClawtipListing, ClawtipListingInput},
    mock_llm::default_mock_llm_response,
    order_file::{
        default_tokens_buddy_orders_dir, list_order_files, order_file_path, read_order_file_by_id,
        write_order_file, write_order_pay_credential, ClawtipOrderFile,
    },
    process_log::ProcessLogEvent,
    relay::{LocalRelayRegistry, NostrRelayAdapter},
};

fn main() {
    if let Err(error) = run(std::env::args().skip(1).collect()) {
        println!(
            "{}",
            ProcessLogEvent::new("clawtip.console.error")
                .field("error", error.clone())
                .to_json_line()
        );
        eprintln!("{error}");
        std::process::exit(1);
    }
}

fn run(args: Vec<String>) -> Result<(), String> {
    match args.as_slice() {
        [scope, command, rest @ ..] if scope == "dev" && command == "order-path" => {
            run_order_path(rest)
        }
        [scope, command, rest @ ..] if scope == "dev" && command == "mock-pay" => {
            run_dev_mock_pay(rest)
        }
        [scope, command, rest @ ..] if scope == "seller" && command == "publish" => {
            run_seller_publish(rest)
        }
        [scope, command, rest @ ..] if scope == "seller" && command == "init-config" => {
            run_seller_init_config(rest)
        }
        [scope, command, rest @ ..] if scope == "seller" && command == "unpublish" => {
            run_seller_unpublish(rest)
        }
        [scope, command, rest @ ..] if scope == "seller" && command == "orders" => {
            run_seller_orders(rest)
        }
        [scope, command, rest @ ..] if scope == "seller" && command == "order" => {
            run_seller_order(rest)
        }
        [scope, command, rest @ ..] if scope == "seller" && command == "status" => {
            run_seller_status(rest)
        }
        [scope, command, rest @ ..] if scope == "seller" && command == "relays" => {
            run_seller_relays(rest)
        }
        [scope, command, rest @ ..] if scope == "buyer" && command == "list" => {
            run_buyer_list(rest)
        }
        [scope, command, rest @ ..] if scope == "buyer" && command == "wait-payment" => {
            run_buyer_wait_payment(rest)
        }
        [scope, command, rest @ ..] if scope == "buyer" && command == "call" => {
            run_buyer_call(rest)
        }
        [scope, command, rest @ ..] if scope == "buyer" && command == "buy" => run_buyer_buy(rest),
        _ => Err(help_text()),
    }
}

fn run_order_path(args: &[String]) -> Result<(), String> {
    let indicator = required_arg(args, "--indicator")?;
    let order_no = required_arg(args, "--order-no")?;
    let base_dir = optional_arg(args, "--orders-dir")
        .map(PathBuf::from)
        .unwrap_or_else(default_tokens_buddy_orders_dir);
    let path = order_file_path(&base_dir, &indicator, &order_no);

    println!(
        "{}",
        ProcessLogEvent::new("clawtip.order_file.path")
            .field("indicator", indicator)
            .field("orderNo", order_no)
            .field("path", path.display().to_string())
            .to_json_line()
    );
    println!("{}", path.display());
    Ok(())
}

fn run_seller_publish(args: &[String]) -> Result<(), String> {
    let model = required_arg(args, "--model")?;
    let amount_fen = required_arg(args, "--amount-fen")?
        .parse::<i64>()
        .map_err(|err| format!("--amount-fen must be an integer: {err}"))?;
    let endpoint = required_arg(args, "--endpoint")?;
    let listing_id = optional_arg(args, "--listing-id").unwrap_or_else(|| "local-mock-llm".into());
    let seller_id = optional_arg(args, "--seller-id").unwrap_or_else(|| "local-seller".into());
    let seller_pubkey =
        optional_arg(args, "--seller-pubkey").unwrap_or_else(|| "fake-seller-pubkey".into());
    let indicator = optional_arg(args, "--indicator").unwrap_or_else(|| "dev-indicator".into());

    println!(
        "{}",
        ProcessLogEvent::new("clawtip.listing.publish.start")
            .field("listingId", listing_id.clone())
            .field("model", model.clone())
            .field("endpoint", endpoint.clone())
            .to_json_line()
    );

    let listing = ClawtipListing::new_available(ClawtipListingInput {
        listing_id,
        seller_id,
        seller_pubkey,
        model_id: model,
        amount_fen,
        endpoint,
        indicator,
        timestamp: chrono::Utc::now().timestamp(),
    });

    let listing = publish_listing(args, listing)?;
    let event_id = listing.relay_event_id.clone().unwrap_or_default();

    println!(
        "{}",
        ProcessLogEvent::new("clawtip.listing.publish.ok")
            .field("relayEventId", event_id.clone())
            .field("listingId", listing.listing_id.clone())
            .field("sellerPubkey", listing.seller_pubkey.clone())
            .to_json_line()
    );
    println!(
        "{}",
        serde_json::to_string_pretty(&listing).map_err(|err| err.to_string())?
    );
    Ok(())
}

fn run_seller_init_config(args: &[String]) -> Result<(), String> {
    let pay_to = required_arg(args, "--pay-to")?;
    let sm4_key_base64 = required_arg(args, "--sm4-key")?;
    let path = optional_arg(args, "--config")
        .map(PathBuf::from)
        .unwrap_or_else(default_config_path);

    write_clawtip_config(
        &path,
        &ClawtipConfigInit {
            pay_to: pay_to.clone(),
            sm4_key_base64: sm4_key_base64.clone(),
        },
    )?;
    println!(
        "{}",
        ProcessLogEvent::new("clawtip.config.loaded")
            .field("path", path.display().to_string())
            .field("payTo", pay_to)
            .field("sm4KeyBase64", sm4_key_base64)
            .to_json_line()
    );
    println!("CONFIG_FILE={}", path.display());
    Ok(())
}

fn run_buyer_list(args: &[String]) -> Result<(), String> {
    let listings = load_buyer_listings(args)?;

    println!(
        "{}",
        ProcessLogEvent::new("clawtip.listing.list.ok")
            .field("count", listings.len().to_string())
            .to_json_line()
    );
    println!(
        "{}",
        serde_json::to_string_pretty(&listings).map_err(|err| err.to_string())?
    );
    Ok(())
}

fn run_seller_unpublish(args: &[String]) -> Result<(), String> {
    let listing_id = required_arg(args, "--listing-id")?;
    local_relay_registry(args).update_status(
        &listing_id,
        ListingStatus::Offline,
        chrono::Utc::now().timestamp(),
    )?;
    println!(
        "{}",
        ProcessLogEvent::new("clawtip.listing.status.update")
            .field("listingId", listing_id)
            .field("status", "offline")
            .to_json_line()
    );
    Ok(())
}

fn run_seller_orders(args: &[String]) -> Result<(), String> {
    let orders = seller_order_views(args)?;
    println!(
        "{}",
        ProcessLogEvent::new("clawtip.seller.orders.list")
            .field("count", orders.len().to_string())
            .to_json_line()
    );
    println!(
        "{}",
        serde_json::to_string_pretty(&orders).map_err(|err| err.to_string())?
    );
    Ok(())
}

fn run_seller_order(args: &[String]) -> Result<(), String> {
    let order_no = order_no_arg(args)?;
    let orders = seller_order_views(args)?;
    let order = orders
        .into_iter()
        .find(|order| order.order_no == order_no)
        .ok_or_else(|| format!("order not found: {order_no}"))?;
    println!(
        "{}",
        ProcessLogEvent::new("clawtip.seller.order.show")
            .field("orderNo", order.order_no.clone())
            .field("paymentStatus", order.payment_status.clone())
            .field("fulfillmentStatus", order.fulfillment_status.clone())
            .to_json_line()
    );
    println!(
        "{}",
        serde_json::to_string_pretty(&order).map_err(|err| err.to_string())?
    );
    Ok(())
}

fn run_seller_status(args: &[String]) -> Result<(), String> {
    let status = seller_status_view(args)?;
    println!(
        "{}",
        ProcessLogEvent::new("clawtip.seller.status")
            .field("listingCount", status.listing_count.to_string())
            .field("orderCount", status.order_count.to_string())
            .field(
                "fulfilledOrderCount",
                status.fulfilled_order_count.to_string()
            )
            .to_json_line()
    );
    println!(
        "{}",
        serde_json::to_string_pretty(&status).map_err(|err| err.to_string())?
    );
    Ok(())
}

fn run_seller_relays(args: &[String]) -> Result<(), String> {
    let relays = relay_urls(args);
    println!(
        "{}",
        ProcessLogEvent::new("clawtip.seller.relays")
            .field("count", relays.len().to_string())
            .to_json_line()
    );
    println!(
        "{}",
        serde_json::to_string_pretty(&relays).map_err(|err| err.to_string())?
    );
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SellerOrderView {
    order_no: String,
    indicator: String,
    order_file: String,
    amount_fen: i64,
    question: String,
    slug: String,
    resource_url: String,
    payment_status: String,
    fulfillment_status: String,
    #[serde(rename = "encryptedPayloadPresent")]
    encrypted_data_present: bool,
    #[serde(rename = "credentialPresent")]
    pay_credential_present: bool,
    call_session_id: Option<String>,
    input_tokens: Option<i64>,
    output_tokens: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SellerStatusView {
    relay_store: String,
    orders_dir: String,
    fulfillment_store: String,
    listing_count: usize,
    available_listing_count: usize,
    reserved_listing_count: usize,
    busy_listing_count: usize,
    offline_listing_count: usize,
    order_count: usize,
    credential_order_count: usize,
    fulfilled_order_count: usize,
}

fn seller_order_views(args: &[String]) -> Result<Vec<SellerOrderView>, String> {
    let base_dir = orders_base_dir(args);
    let indicator = optional_arg(args, "--indicator");
    let order_no = order_no_arg(args).ok();
    let store = LocalFulfillmentStore::new(fulfillment_store_path(args));
    let mut views = Vec::new();

    for (indicator, path, order) in list_order_files(&base_dir, indicator.as_deref())? {
        if let Some(order_no) = &order_no {
            if &order.order_no != order_no {
                continue;
            }
        }
        let fulfillment = store.record_for_order(&order.order_no)?;
        let (fulfillment_status, call_session_id, input_tokens, output_tokens) =
            if let Some(record) = fulfillment {
                (
                    record.status,
                    Some(record.call_session_id),
                    Some(record.input_tokens),
                    Some(record.output_tokens),
                )
            } else {
                ("not_fulfilled".to_string(), None, None, None)
            };

        views.push(SellerOrderView {
            order_no: order.order_no.clone(),
            indicator,
            order_file: path.display().to_string(),
            amount_fen: order.amount,
            question: order.question.clone(),
            slug: order.slug.clone(),
            resource_url: order.resource_url.clone(),
            payment_status: payment_status_for_order(args, &order),
            fulfillment_status,
            encrypted_data_present: !order.encrypted_data.is_empty(),
            pay_credential_present: order
                .pay_credential
                .as_deref()
                .is_some_and(|credential| !credential.is_empty()),
            call_session_id,
            input_tokens,
            output_tokens,
        });
    }

    Ok(views)
}

fn seller_status_view(args: &[String]) -> Result<SellerStatusView, String> {
    let relay_store = local_relay_registry(args);
    let listings = relay_store.all_listings()?;
    let orders = list_order_files(
        &orders_base_dir(args),
        optional_arg(args, "--indicator").as_deref(),
    )?;
    let fulfillment_store = LocalFulfillmentStore::new(fulfillment_store_path(args));
    let fulfillments = fulfillment_store.records()?;
    let fulfilled_order_numbers = fulfillments
        .iter()
        .map(|record| record.order_no.as_str())
        .collect::<std::collections::HashSet<_>>();

    Ok(SellerStatusView {
        relay_store: local_relay_registry_path(args).display().to_string(),
        orders_dir: orders_base_dir(args).display().to_string(),
        fulfillment_store: fulfillment_store_path(args).display().to_string(),
        listing_count: listings.len(),
        available_listing_count: listings
            .iter()
            .filter(|listing| listing.status == ListingStatus::Available)
            .count(),
        reserved_listing_count: listings
            .iter()
            .filter(|listing| listing.status == ListingStatus::Reserved)
            .count(),
        busy_listing_count: listings
            .iter()
            .filter(|listing| listing.status == ListingStatus::Busy)
            .count(),
        offline_listing_count: listings
            .iter()
            .filter(|listing| listing.status == ListingStatus::Offline)
            .count(),
        order_count: orders.len(),
        credential_order_count: orders
            .iter()
            .filter(|(_, _, order)| {
                order
                    .pay_credential
                    .as_deref()
                    .is_some_and(|credential| !credential.is_empty())
            })
            .count(),
        fulfilled_order_count: orders
            .iter()
            .filter(|(_, _, order)| fulfilled_order_numbers.contains(order.order_no.as_str()))
            .count(),
    })
}

fn payment_status_for_order(args: &[String], order: &ClawtipOrderFile) -> String {
    let Some(credential) = order.pay_credential.as_deref() else {
        return "waiting_payment".to_string();
    };

    let Some(sm4_key_base64) = optional_sm4_key_base64(args) else {
        return "credential_present".to_string();
    };

    match verify_pay_credential_for_order(order, credential, &sm4_key_base64) {
        Ok(_) => "verified".to_string(),
        Err(err) => format!("verification_failed: {err}"),
    }
}

fn load_buyer_listings(args: &[String]) -> Result<Vec<ClawtipListing>, String> {
    if has_flag(args, "--real-relay") {
        return run_async(
            NostrRelayAdapter::new(relay_urls(args)).find_available_clawtip_listings(),
        );
    }
    local_relay_registry(args).find_available_clawtip_listings()
}

fn run_buyer_buy(args: &[String]) -> Result<(), String> {
    let listing_id = required_arg(args, "--listing-id")?;
    let prompt = required_arg(args, "--prompt")?;
    let amount_fen = required_arg(args, "--amount-fen")?
        .parse::<i64>()
        .map_err(|err| format!("--amount-fen must be an integer: {err}"))?;
    let pay_to = required_arg(args, "--pay-to")?;
    let indicator = optional_arg(args, "--indicator").unwrap_or_else(|| "dev-indicator".into());
    let order_no = optional_arg(args, "--order-no").unwrap_or_else(generate_order_no);
    let encrypted_data = build_encrypted_data(args, &order_no, amount_fen, &pay_to)?;
    let base_dir = optional_arg(args, "--orders-dir")
        .map(PathBuf::from)
        .unwrap_or_else(default_tokens_buddy_orders_dir);
    let endpoint =
        optional_arg(args, "--endpoint").unwrap_or_else(|| "http://127.0.0.1:37891".into());

    println!(
        "{}",
        ProcessLogEvent::new("clawtip.order.create.start")
            .field("listingId", listing_id.clone())
            .field("orderNo", order_no.clone())
            .to_json_line()
    );

    let order = ClawtipOrderFile {
        skill_id: "si-tokens-buddy-llm-console".to_string(),
        order_no: order_no.clone(),
        amount: amount_fen,
        question: prompt.clone(),
        encrypted_data,
        pay_to,
        description: "TokensBuddy LLM console test call".to_string(),
        slug: "tokens-buddy-llm-console".to_string(),
        resource_url: endpoint,
        pay_credential: None,
    };

    let path = write_order_file(&base_dir, &indicator, &order)?;
    maybe_update_listing_status(args, &listing_id, ListingStatus::Reserved);

    println!(
        "{}",
        ProcessLogEvent::new("clawtip.order_file.write.ok")
            .field("listingId", listing_id)
            .field("orderNo", order_no.clone())
            .field("path", path.display().to_string())
            .to_json_line()
    );
    println!("ORDER_NO={order_no}");
    println!("AMOUNT={amount_fen}");
    println!("QUESTION={prompt}");
    println!("INDICATOR={indicator}");
    println!("ORDER_FILE={}", path.display());
    println!("PAYMENT_PROVIDER=clawtip");
    Ok(())
}

fn run_buyer_wait_payment(args: &[String]) -> Result<(), String> {
    let order_no = required_arg(args, "--order-no")?;
    let indicator = optional_arg(args, "--indicator").unwrap_or_else(|| "dev-indicator".into());
    let base_dir = orders_base_dir(args);
    let timeout_ms = optional_arg(args, "--timeout-ms")
        .unwrap_or_else(|| "30000".to_string())
        .parse::<u64>()
        .map_err(|err| format!("--timeout-ms must be an integer: {err}"))?;

    println!(
        "{}",
        ProcessLogEvent::new("clawtip.payment.wait.start")
            .field("orderNo", order_no.clone())
            .to_json_line()
    );
    let order = wait_for_payment_credential(
        &base_dir,
        &indicator,
        &order_no,
        Duration::from_millis(timeout_ms),
        Duration::from_millis(250),
    )?;

    println!(
        "{}",
        ProcessLogEvent::new("clawtip.payment.credential.detected")
            .field("orderNo", order.order_no.clone())
            .field(
                "payCredential",
                order.pay_credential.clone().unwrap_or_default(),
            )
            .to_json_line()
    );
    println!("ORDER_NO={}", order.order_no);
    println!("PAYMENT_STATUS=credential_detected");
    Ok(())
}

fn run_dev_mock_pay(args: &[String]) -> Result<(), String> {
    let order_no = required_arg(args, "--order-no")?;
    let indicator = optional_arg(args, "--indicator").unwrap_or_else(|| "dev-indicator".into());
    let status = optional_arg(args, "--status").unwrap_or_else(|| "SUCCESS".to_string());
    let base_dir = orders_base_dir(args);
    let sm4_key_base64 = sm4_key_base64(args)?;
    let order = read_order_file_by_id(&base_dir, &indicator, &order_no)?;
    let finish_time = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let credential = create_mock_pay_credential(&order, &sm4_key_base64, &status, &finish_time)?;
    let path = write_order_pay_credential(&base_dir, &indicator, &order_no, &credential)?;

    println!(
        "{}",
        ProcessLogEvent::new("clawtip.dev.mock_pay.ok")
            .field("orderNo", order_no.clone())
            .field("status", status)
            .field("payCredential", credential)
            .field("path", path.display().to_string())
            .to_json_line()
    );
    println!("ORDER_NO={order_no}");
    println!("MOCK_PAY_STATUS=written");
    Ok(())
}

fn run_buyer_call(args: &[String]) -> Result<(), String> {
    let result = call_paid_order(args)?;
    if result.already_fulfilled {
        println!(
            "{}",
            ProcessLogEvent::new("clawtip.fulfillment.duplicate")
                .field("callSessionId", result.call_session_id.clone())
                .to_json_line()
        );
    } else if has_flag(args, "--stream") {
        for chunk in default_mock_llm_response().chunks {
            println!(
                "{}",
                ProcessLogEvent::new("clawtip.inference.mock.chunk")
                    .field("text", chunk.clone())
                    .to_json_line()
            );
            println!("{chunk}");
        }
    }

    println!(
        "{}",
        ProcessLogEvent::new("clawtip.inference.mock.done")
            .field("callSessionId", result.call_session_id.clone())
            .field("alreadyFulfilled", result.already_fulfilled.to_string())
            .field("inputTokens", result.usage.input_tokens.to_string())
            .field("outputTokens", result.usage.output_tokens.to_string())
            .to_json_line()
    );
    println!("CALL_SESSION_ID={}", result.call_session_id);
    println!("ALREADY_FULFILLED={}", result.already_fulfilled);
    println!("ANSWER={}", result.answer);
    println!("INPUT_TOKENS={}", result.usage.input_tokens);
    println!("OUTPUT_TOKENS={}", result.usage.output_tokens);
    Ok(())
}

fn call_paid_order(args: &[String]) -> Result<ClawtipFulfillmentResult, String> {
    let order_no = required_arg(args, "--order-no")?;
    let indicator = optional_arg(args, "--indicator").unwrap_or_else(|| "dev-indicator".into());
    let base_dir = orders_base_dir(args);
    let sm4_key_base64 = sm4_key_base64(args)?;
    let order = read_order_file_by_id(&base_dir, &indicator, &order_no)?;
    let credential = order
        .pay_credential
        .as_deref()
        .ok_or_else(|| format!("payCredential missing for order {order_no}"))?;

    println!(
        "{}",
        ProcessLogEvent::new("clawtip.credential.decrypt.start")
            .field("orderNo", order_no.clone())
            .to_json_line()
    );
    verify_pay_credential_for_order(&order, credential, &sm4_key_base64)?;
    println!(
        "{}",
        ProcessLogEvent::new("clawtip.payment.verify.ok")
            .field("orderNo", order_no)
            .to_json_line()
    );
    println!(
        "{}",
        ProcessLogEvent::new("clawtip.inference.mock.start").to_json_line()
    );

    let store = LocalFulfillmentStore::new(fulfillment_store_path(args));
    let result = store.fulfill_once(&order)?;
    if !result.already_fulfilled {
        if let Some(listing_id) = optional_arg(args, "--listing-id") {
            maybe_update_listing_status(args, &listing_id, ListingStatus::Busy);
            maybe_update_listing_status(args, &listing_id, ListingStatus::Available);
        }
    }
    if !result.already_fulfilled {
        println!(
            "{}",
            ProcessLogEvent::new("clawtip.fulfillment.record.ok")
                .field("callSessionId", result.call_session_id.clone())
                .to_json_line()
        );
    }
    Ok(result)
}

fn wait_for_payment_credential(
    base_dir: &Path,
    indicator: &str,
    order_no: &str,
    timeout: Duration,
    interval: Duration,
) -> Result<ClawtipOrderFile, String> {
    let started_at = Instant::now();
    loop {
        let order = read_order_file_by_id(base_dir, indicator, order_no)?;
        if order
            .pay_credential
            .as_deref()
            .is_some_and(|value| !value.is_empty())
        {
            return Ok(order);
        }
        if started_at.elapsed() >= timeout {
            return Err(format!(
                "timeout waiting for payCredential on order {order_no}"
            ));
        }
        std::thread::sleep(interval);
    }
}

fn build_encrypted_data(
    args: &[String],
    order_no: &str,
    amount_fen: i64,
    pay_to: &str,
) -> Result<String, String> {
    if let Some(encrypted_data) = optional_arg(args, "--encrypted-data") {
        return Ok(encrypted_data);
    }

    let sm4_key_base64 = sm4_key_base64(args)
        .map_err(|_| "missing --encrypted-data or --sm4-key-base64/CLAWTIP_SM4_KEY".to_string())?;

    println!(
        "{}",
        ProcessLogEvent::new("clawtip.encrypted_data.create.start")
            .field("orderNo", order_no.to_string())
            .field("sm4KeyBase64", sm4_key_base64.clone())
            .to_json_line()
    );
    let encrypted_data =
        encrypt_clawtip_order_data_base64(order_no, amount_fen, pay_to, &sm4_key_base64)?;
    println!(
        "{}",
        ProcessLogEvent::new("clawtip.encrypted_data.create.ok")
            .field("orderNo", order_no.to_string())
            .to_json_line()
    );

    Ok(encrypted_data)
}

fn local_relay_registry(args: &[String]) -> LocalRelayRegistry {
    LocalRelayRegistry::new(local_relay_registry_path(args))
}

fn local_relay_registry_path(args: &[String]) -> PathBuf {
    optional_arg(args, "--relay-store")
        .map(PathBuf::from)
        .unwrap_or_else(LocalRelayRegistry::default_path)
}

fn publish_listing(args: &[String], listing: ClawtipListing) -> Result<ClawtipListing, String> {
    if has_flag(args, "--real-relay") {
        return run_async(NostrRelayAdapter::new(relay_urls(args)).publish(listing));
    }

    let relay = local_relay_registry(args);
    let event_id = relay.publish(listing.clone())?;
    let mut listing = listing;
    listing.relay_event_id = Some(event_id);
    Ok(listing)
}

fn relay_urls(args: &[String]) -> Vec<String> {
    let relays = values_for_arg(args, "--relay");
    if relays.is_empty() {
        NostrRelayAdapter::default_relays()
    } else {
        relays
    }
}

fn run_async<T>(future: impl std::future::Future<Output = Result<T, String>>) -> Result<T, String> {
    tokio::runtime::Runtime::new()
        .map_err(|err| format!("failed to create async runtime: {err}"))?
        .block_on(future)
}

fn orders_base_dir(args: &[String]) -> PathBuf {
    optional_arg(args, "--orders-dir")
        .map(PathBuf::from)
        .unwrap_or_else(default_tokens_buddy_orders_dir)
}

fn sm4_key_base64(args: &[String]) -> Result<String, String> {
    optional_sm4_key_base64(args)
        .ok_or_else(|| "missing --sm4-key-base64 or CLAWTIP_SM4_KEY".to_string())
}

fn optional_sm4_key_base64(args: &[String]) -> Option<String> {
    optional_arg(args, "--sm4-key-base64").or_else(|| std::env::var("CLAWTIP_SM4_KEY").ok())
}

fn fulfillment_store_path(args: &[String]) -> PathBuf {
    optional_arg(args, "--fulfillment-store")
        .map(PathBuf::from)
        .unwrap_or_else(LocalFulfillmentStore::default_path)
}

fn has_flag(args: &[String], name: &str) -> bool {
    args.iter().any(|arg| arg == name)
}

fn maybe_update_listing_status(args: &[String], listing_id: &str, status: ListingStatus) {
    if local_relay_registry(args)
        .update_status(listing_id, status, chrono::Utc::now().timestamp())
        .is_ok()
    {
        println!(
            "{}",
            ProcessLogEvent::new("clawtip.listing.status.update")
                .field("listingId", listing_id.to_string())
                .field("status", format!("{status:?}").to_lowercase())
                .to_json_line()
        );
    }
}

fn generate_order_no() -> String {
    format!(
        "{}{}",
        chrono::Utc::now().format("%Y%m%d%H%M%S"),
        uuid::Uuid::new_v4()
            .simple()
            .to_string()
            .chars()
            .take(6)
            .collect::<String>()
    )
}

fn required_arg(args: &[String], name: &str) -> Result<String, String> {
    optional_arg(args, name).ok_or_else(|| format!("missing required argument {name}"))
}

fn order_no_arg(args: &[String]) -> Result<String, String> {
    optional_arg(args, "--order-no")
        .or_else(|| args.first().filter(|arg| !arg.starts_with("--")).cloned())
        .ok_or_else(|| "missing required argument --order-no".to_string())
}

fn optional_arg(args: &[String], name: &str) -> Option<String> {
    args.windows(2)
        .find(|window| window[0] == name)
        .map(|window| window[1].clone())
}

fn values_for_arg(args: &[String], name: &str) -> Vec<String> {
    args.windows(2)
        .filter(|window| window[0] == name)
        .map(|window| window[1].clone())
        .collect()
}

fn help_text() -> String {
    [
        "usage:",
        "  clawtip-console dev order-path --indicator <id> --order-no <order>",
        "  clawtip-console dev mock-pay --order-no <order> [--status SUCCESS] [--sm4-key-base64 <key>]",
        "  clawtip-console seller init-config --pay-to env:CLAWTIP_PAY_TO --sm4-key env:CLAWTIP_SM4_KEY",
        "  clawtip-console seller publish --model <model> --amount-fen <fen> --endpoint <url> [--relay-store <path> | --real-relay --relay <wss-url>]",
        "  clawtip-console seller unpublish --listing-id <id> [--relay-store <path>]",
        "  clawtip-console seller orders [--indicator <id>] [--orders-dir <path>]",
        "  clawtip-console seller order --order-no <order> [--indicator <id>] [--sm4-key-base64 <key>]",
        "  clawtip-console seller status [--relay-store <path>] [--orders-dir <path>]",
        "  clawtip-console seller relays [--relay <wss-url>]",
        "  clawtip-console buyer list [--relay-store <path> | --real-relay --relay <wss-url>]",
        "  clawtip-console buyer buy --listing-id <id> --prompt <text> --amount-fen <fen> --pay-to <payTo> [--encrypted-data <ciphertext> | --sm4-key-base64 <key>]",
        "  clawtip-console buyer wait-payment --order-no <order>",
        "  clawtip-console buyer call --order-no <order> [--stream] [--sm4-key-base64 <key>]",
    ]
    .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use tokens_buddy_lib::clawtip::crypto::decrypt_sm4_ecb_pkcs7_base64;

    #[test]
    fn buyer_buy_generates_encrypted_data_from_sm4_key() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let args = vec![
            "--listing-id".to_string(),
            "listing-1".to_string(),
            "--prompt".to_string(),
            "hello".to_string(),
            "--amount-fen".to_string(),
            "1".to_string(),
            "--pay-to".to_string(),
            "payto_1234567890abcdef".to_string(),
            "--sm4-key-base64".to_string(),
            "MDEyMzQ1Njc4OUFCQ0RFRg==".to_string(),
            "--indicator".to_string(),
            "indicator123".to_string(),
            "--order-no".to_string(),
            "202604250001".to_string(),
            "--orders-dir".to_string(),
            temp_dir.path().display().to_string(),
        ];

        run_buyer_buy(&args).expect("buyer buy should write an order file");

        let path = temp_dir
            .path()
            .join("indicator123")
            .join("202604250001.json");
        let raw = std::fs::read_to_string(path).expect("read order file");
        let value: Value = serde_json::from_str(&raw).expect("parse order file");
        let encrypted_data = value["encrypted_data"]
            .as_str()
            .expect("encrypted_data string");
        let plaintext = decrypt_sm4_ecb_pkcs7_base64(encrypted_data, "MDEyMzQ1Njc4OUFCQ0RFRg==")
            .expect("decrypt encrypted_data");
        let payment: Value = serde_json::from_str(&plaintext).expect("parse payment payload");

        assert_eq!(value["pay_to"], "payto_1234567890abcdef");
        assert_eq!(payment["orderNo"], "202604250001");
        assert_eq!(payment["amount"], 1);
        assert_eq!(payment["payTo"], "payto_1234567890abcdef");
    }

    #[test]
    fn seller_publish_can_be_listed_by_buyer_list_from_local_registry() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let relay_store = temp_dir.path().join("listings.json");

        run_seller_publish(&[
            "--model".to_string(),
            "mock-llm".to_string(),
            "--amount-fen".to_string(),
            "1".to_string(),
            "--endpoint".to_string(),
            "http://127.0.0.1:37891".to_string(),
            "--relay-store".to_string(),
            relay_store.display().to_string(),
        ])
        .expect("publish listing");

        let listings = load_buyer_listings(&[
            "--relay-store".to_string(),
            relay_store.display().to_string(),
        ])
        .expect("load buyer listings");

        assert_eq!(listings.len(), 1);
        assert_eq!(listings[0].listing_id, "local-mock-llm");
        assert_eq!(listings[0].model_id, "mock-llm");
        assert_eq!(listings[0].amount_fen, 1);
    }

    #[test]
    fn dev_mock_pay_writes_credential_and_wait_payment_reads_it() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let key_base64 = "MDEyMzQ1Njc4OUFCQ0RFRg==";
        run_buyer_buy(&[
            "--listing-id".to_string(),
            "listing-1".to_string(),
            "--prompt".to_string(),
            "hello".to_string(),
            "--amount-fen".to_string(),
            "1".to_string(),
            "--pay-to".to_string(),
            "payto_1234567890abcdef".to_string(),
            "--sm4-key-base64".to_string(),
            key_base64.to_string(),
            "--indicator".to_string(),
            "indicator123".to_string(),
            "--order-no".to_string(),
            "202604250001".to_string(),
            "--orders-dir".to_string(),
            temp_dir.path().display().to_string(),
        ])
        .expect("write order");

        run_dev_mock_pay(&[
            "--order-no".to_string(),
            "202604250001".to_string(),
            "--indicator".to_string(),
            "indicator123".to_string(),
            "--orders-dir".to_string(),
            temp_dir.path().display().to_string(),
            "--sm4-key-base64".to_string(),
            key_base64.to_string(),
            "--status".to_string(),
            "SUCCESS".to_string(),
        ])
        .expect("mock pay");

        let order = wait_for_payment_credential(
            temp_dir.path(),
            "indicator123",
            "202604250001",
            std::time::Duration::from_millis(0),
            std::time::Duration::from_millis(1),
        )
        .expect("wait payment");

        assert!(order.pay_credential.is_some());
    }

    #[test]
    fn buyer_call_verifies_payment_and_is_idempotent() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let fulfillment_store = temp_dir.path().join("fulfillments.json");
        let key_base64 = "MDEyMzQ1Njc4OUFCQ0RFRg==";
        run_buyer_buy(&[
            "--listing-id".to_string(),
            "listing-1".to_string(),
            "--prompt".to_string(),
            "hello".to_string(),
            "--amount-fen".to_string(),
            "1".to_string(),
            "--pay-to".to_string(),
            "payto_1234567890abcdef".to_string(),
            "--sm4-key-base64".to_string(),
            key_base64.to_string(),
            "--indicator".to_string(),
            "indicator123".to_string(),
            "--order-no".to_string(),
            "202604250001".to_string(),
            "--orders-dir".to_string(),
            temp_dir.path().display().to_string(),
        ])
        .expect("write order");
        run_dev_mock_pay(&[
            "--order-no".to_string(),
            "202604250001".to_string(),
            "--indicator".to_string(),
            "indicator123".to_string(),
            "--orders-dir".to_string(),
            temp_dir.path().display().to_string(),
            "--sm4-key-base64".to_string(),
            key_base64.to_string(),
        ])
        .expect("mock pay");

        let first = call_paid_order(&[
            "--order-no".to_string(),
            "202604250001".to_string(),
            "--indicator".to_string(),
            "indicator123".to_string(),
            "--orders-dir".to_string(),
            temp_dir.path().display().to_string(),
            "--sm4-key-base64".to_string(),
            key_base64.to_string(),
            "--fulfillment-store".to_string(),
            fulfillment_store.display().to_string(),
        ])
        .expect("first call");
        let second = call_paid_order(&[
            "--order-no".to_string(),
            "202604250001".to_string(),
            "--indicator".to_string(),
            "indicator123".to_string(),
            "--orders-dir".to_string(),
            temp_dir.path().display().to_string(),
            "--sm4-key-base64".to_string(),
            key_base64.to_string(),
            "--fulfillment-store".to_string(),
            fulfillment_store.display().to_string(),
        ])
        .expect("second call");

        assert!(!first.already_fulfilled);
        assert!(second.already_fulfilled);
        assert_eq!(first.call_session_id, second.call_session_id);
    }

    #[test]
    fn seller_init_config_writes_env_refs() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let config_path = temp_dir.path().join("clawtip-market.toml");

        run_seller_init_config(&[
            "--pay-to".to_string(),
            "env:CLAWTIP_PAY_TO".to_string(),
            "--sm4-key".to_string(),
            "env:CLAWTIP_SM4_KEY".to_string(),
            "--config".to_string(),
            config_path.display().to_string(),
        ])
        .expect("init config");

        let raw = std::fs::read_to_string(config_path).expect("read config");
        assert!(raw.contains("pay_to = \"env:CLAWTIP_PAY_TO\""));
        assert!(raw.contains("sm4_key_base64 = \"env:CLAWTIP_SM4_KEY\""));
    }

    #[test]
    fn seller_order_view_redacts_sensitive_payment_data() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let key_base64 = "MDEyMzQ1Njc4OUFCQ0RFRg==";
        run_buyer_buy(&[
            "--listing-id".to_string(),
            "listing-1".to_string(),
            "--prompt".to_string(),
            "hello".to_string(),
            "--amount-fen".to_string(),
            "1".to_string(),
            "--pay-to".to_string(),
            "payto_1234567890abcdef".to_string(),
            "--sm4-key-base64".to_string(),
            key_base64.to_string(),
            "--indicator".to_string(),
            "indicator123".to_string(),
            "--order-no".to_string(),
            "202604250001".to_string(),
            "--orders-dir".to_string(),
            temp_dir.path().display().to_string(),
        ])
        .expect("write order");
        run_dev_mock_pay(&[
            "--order-no".to_string(),
            "202604250001".to_string(),
            "--indicator".to_string(),
            "indicator123".to_string(),
            "--orders-dir".to_string(),
            temp_dir.path().display().to_string(),
            "--sm4-key-base64".to_string(),
            key_base64.to_string(),
        ])
        .expect("mock pay");

        let views = seller_order_views(&[
            "--order-no".to_string(),
            "202604250001".to_string(),
            "--indicator".to_string(),
            "indicator123".to_string(),
            "--orders-dir".to_string(),
            temp_dir.path().display().to_string(),
        ])
        .expect("build seller order view");
        let rendered = serde_json::to_string(&views[0]).expect("serialize view");

        assert_eq!(views.len(), 1);
        assert_eq!(views[0].payment_status, "credential_present");
        assert!(views[0].pay_credential_present);
        assert!(views[0].encrypted_data_present);
        assert!(!rendered.contains("payto_1234567890abcdef"));
        assert!(!rendered.contains("encrypted_data"));
        assert!(!rendered.contains("payCredential"));
    }

    #[test]
    fn seller_order_view_reports_verified_and_fulfilled() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let fulfillment_store = temp_dir.path().join("fulfillments.json");
        let key_base64 = "MDEyMzQ1Njc4OUFCQ0RFRg==";
        run_buyer_buy(&[
            "--listing-id".to_string(),
            "listing-1".to_string(),
            "--prompt".to_string(),
            "hello".to_string(),
            "--amount-fen".to_string(),
            "1".to_string(),
            "--pay-to".to_string(),
            "payto_1234567890abcdef".to_string(),
            "--sm4-key-base64".to_string(),
            key_base64.to_string(),
            "--indicator".to_string(),
            "indicator123".to_string(),
            "--order-no".to_string(),
            "202604250001".to_string(),
            "--orders-dir".to_string(),
            temp_dir.path().display().to_string(),
        ])
        .expect("write order");
        run_dev_mock_pay(&[
            "--order-no".to_string(),
            "202604250001".to_string(),
            "--indicator".to_string(),
            "indicator123".to_string(),
            "--orders-dir".to_string(),
            temp_dir.path().display().to_string(),
            "--sm4-key-base64".to_string(),
            key_base64.to_string(),
        ])
        .expect("mock pay");
        let result = call_paid_order(&[
            "--order-no".to_string(),
            "202604250001".to_string(),
            "--indicator".to_string(),
            "indicator123".to_string(),
            "--orders-dir".to_string(),
            temp_dir.path().display().to_string(),
            "--sm4-key-base64".to_string(),
            key_base64.to_string(),
            "--fulfillment-store".to_string(),
            fulfillment_store.display().to_string(),
        ])
        .expect("call order");

        let views = seller_order_views(&[
            "--order-no".to_string(),
            "202604250001".to_string(),
            "--indicator".to_string(),
            "indicator123".to_string(),
            "--orders-dir".to_string(),
            temp_dir.path().display().to_string(),
            "--sm4-key-base64".to_string(),
            key_base64.to_string(),
            "--fulfillment-store".to_string(),
            fulfillment_store.display().to_string(),
        ])
        .expect("build seller order view");

        assert_eq!(views[0].payment_status, "verified");
        assert_eq!(views[0].fulfillment_status, "fulfilled");
        assert_eq!(
            views[0].call_session_id.as_deref(),
            Some(result.call_session_id.as_str())
        );
        assert_eq!(views[0].input_tokens, Some(32));
        assert_eq!(views[0].output_tokens, Some(64));
    }

    #[test]
    fn seller_status_view_reports_listing_and_order_counts() {
        let temp_dir = tempfile::tempdir().expect("create temp dir");
        let relay_store = temp_dir.path().join("listings.json");
        let orders_dir = temp_dir.path().join("orders");
        run_seller_publish(&[
            "--model".to_string(),
            "mock-llm".to_string(),
            "--amount-fen".to_string(),
            "1".to_string(),
            "--endpoint".to_string(),
            "http://127.0.0.1:37891".to_string(),
            "--relay-store".to_string(),
            relay_store.display().to_string(),
        ])
        .expect("publish listing");
        run_buyer_buy(&[
            "--listing-id".to_string(),
            "local-mock-llm".to_string(),
            "--prompt".to_string(),
            "hello".to_string(),
            "--amount-fen".to_string(),
            "1".to_string(),
            "--pay-to".to_string(),
            "payto_1234567890abcdef".to_string(),
            "--sm4-key-base64".to_string(),
            "MDEyMzQ1Njc4OUFCQ0RFRg==".to_string(),
            "--indicator".to_string(),
            "indicator123".to_string(),
            "--order-no".to_string(),
            "202604250001".to_string(),
            "--orders-dir".to_string(),
            orders_dir.display().to_string(),
        ])
        .expect("write order");

        let status = seller_status_view(&[
            "--relay-store".to_string(),
            relay_store.display().to_string(),
            "--orders-dir".to_string(),
            orders_dir.display().to_string(),
        ])
        .expect("seller status");

        assert_eq!(status.listing_count, 1);
        assert_eq!(status.available_listing_count, 1);
        assert_eq!(status.order_count, 1);
        assert_eq!(status.fulfilled_order_count, 0);
    }
}
