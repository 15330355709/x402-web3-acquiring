import { Router, Request, Response } from "express";
import path from "path";
import { getPaymentLink } from "../services/paymentLinkService";
import { buildPaymentRequirements, facilitatorClient } from "../services/x402Service";
import { creditMerchantBalance } from "../services/balanceService";
import { supabase } from "../db/supabase";

const router = Router();

// Serve payment page for browser requests
router.get("/:id", (req: Request, res: Response, next) => {
  const accept = req.headers.accept || "";
  if (accept.includes("text/html")) {
    res.sendFile(path.join(__dirname, "../../public/pay.html"));
    return;
  }
  next();
});

// x402 payment endpoint for a payment link
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const link = await getPaymentLink(req.params.id as string);

    if (!link) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }

    if (link.status === "expired") {
      res.status(410).json({ error: "Payment link has expired" });
      return;
    }

    if (link.status === "paid") {
      res.status(200).json({ message: "Payment already completed", tx_hash: link.tx_hash });
      return;
    }

    // Check for PAYMENT-SIGNATURE header
    const paymentSignature = req.headers["payment-signature"] as string | undefined;

    if (!paymentSignature) {
      // Step 1: Return 402 with payment requirements
      const requirements = buildPaymentRequirements(
        String(Math.round(link.amount * 1e6)) // USDT has 6 decimals
      );

      const paymentRequired = {
        x402Version: 2,
        error: "Payment required",
        resource: {
          url: `${req.protocol}://${req.headers.host}${req.originalUrl}`,
          description: link.description || "Payment",
          mimeType: "application/json",
        },
        accepts: [requirements],
      };

      const headerValue = Buffer.from(JSON.stringify(paymentRequired)).toString("base64");
      res.setHeader("PAYMENT-REQUIRED", headerValue);
      res.status(402).json(paymentRequired);
      return;
    }

    // Step 2: Decode and verify payment
    let paymentPayload;
    try {
      paymentPayload = JSON.parse(Buffer.from(paymentSignature, "base64").toString("utf-8"));
    } catch {
      res.status(400).json({ error: "Invalid PAYMENT-SIGNATURE header" });
      return;
    }

    const requirements = buildPaymentRequirements(
      String(Math.round(link.amount * 1e6))
    );

    // Verify payment with Facilitator
    const verifyResult = await facilitatorClient.verify(paymentPayload, requirements);

    if (!verifyResult.isValid) {
      const paymentRequired = {
        x402Version: 2,
        error: verifyResult.invalidReason || "Payment verification failed",
        resource: {
          url: `${req.protocol}://${req.headers.host}${req.originalUrl}`,
        },
        accepts: [requirements],
      };
      const headerValue = Buffer.from(JSON.stringify(paymentRequired)).toString("base64");
      res.setHeader("PAYMENT-REQUIRED", headerValue);
      res.status(402).json({ error: verifyResult.invalidReason });
      return;
    }

    // Step 3: Settle payment via Facilitator
    let settleResult;
    try {
      settleResult = await facilitatorClient.settle(paymentPayload, requirements);
    } catch (err: any) {
      // Mark as settlement failed
      await supabase
        .from("payment_links")
        .update({ status: "settlement_failed", updated_at: new Date().toISOString() })
        .eq("id", link.id);

      res.status(502).json({ error: "Settlement failed", detail: err.message });
      return;
    }

    if (!settleResult.success) {
      await supabase
        .from("payment_links")
        .update({ status: "settlement_failed", updated_at: new Date().toISOString() })
        .eq("id", link.id);

      res.status(502).json({ error: "Settlement failed", reason: settleResult.errorReason });
      return;
    }

    // Step 4: Update payment status and credit merchant balance
    const txHash = settleResult.transaction;

    await supabase
      .from("payment_links")
      .update({
        status: "paid",
        tx_hash: txHash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", link.id);

    await creditMerchantBalance(link.merchant_id, link.amount, link.id, txHash);

    // Return success with PAYMENT-RESPONSE header
    const paymentResponse = {
      success: true,
      transaction: txHash,
      network: settleResult.network,
    };
    const responseHeader = Buffer.from(JSON.stringify(paymentResponse)).toString("base64");
    res.setHeader("PAYMENT-RESPONSE", responseHeader);
    res.status(200).json({
      message: "Payment successful",
      tx_hash: txHash,
    });
  } catch (err: any) {
    console.error("Payment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
