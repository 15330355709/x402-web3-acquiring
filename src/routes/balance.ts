import { Router, Request, Response } from "express";
import { getBalance, getLedgerHistory } from "../services/balanceService";
import {
  createWithdrawal,
  reviewWithdrawal,
  completeWithdrawal,
  failWithdrawal,
} from "../services/withdrawalService";

const router = Router();

// Get merchant balance
router.get("/:merchantId", async (req: Request, res: Response) => {
  try {
    const balance = await getBalance(req.params.merchantId as string);
    if (!balance) {
      res.json({ merchant_id: req.params.merchantId as string, available_balance: 0 });
      return;
    }
    res.json(balance);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get transaction history
router.get("/:merchantId/history", async (req: Request, res: Response) => {
  try {
    const { start_date, end_date, page, page_size } = req.query;
    const result = await getLedgerHistory(
      req.params.merchantId as string,
      {
        startDate: start_date as string | undefined,
        endDate: end_date as string | undefined,
      },
      parseInt((page as string) || "1", 10),
      parseInt((page_size as string) || "20", 10)
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Submit withdrawal request
router.post("/:merchantId/withdraw", async (req: Request, res: Response) => {
  try {
    const { amount, destination_address } = req.body;

    if (!amount || !destination_address) {
      res.status(400).json({ error: "amount and destination_address are required" });
      return;
    }

    if (typeof amount !== "number" || amount <= 0) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }

    const withdrawal = await createWithdrawal(
      req.params.merchantId as string,
      amount,
      destination_address
    );
    res.status(201).json(withdrawal);
  } catch (err: any) {
    if (err.message === "Insufficient balance") {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err.message === "Invalid Ethereum address format") {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// Review withdrawal (platform admin)
router.post("/withdrawals/:id/review", async (req: Request, res: Response) => {
  try {
    const { action, reviewed_by } = req.body;

    if (!action || !["approve", "reject"].includes(action)) {
      res.status(400).json({ error: "action must be 'approve' or 'reject'" });
      return;
    }

    if (!reviewed_by) {
      res.status(400).json({ error: "reviewed_by is required" });
      return;
    }

    const withdrawal = await reviewWithdrawal(req.params.id as string, action, reviewed_by);
    res.json(withdrawal);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Complete withdrawal (after on-chain transfer)
router.post("/withdrawals/:id/complete", async (req: Request, res: Response) => {
  try {
    const { tx_hash } = req.body;
    if (!tx_hash) {
      res.status(400).json({ error: "tx_hash is required" });
      return;
    }

    const withdrawal = await completeWithdrawal(req.params.id as string, tx_hash);
    res.json(withdrawal);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mark withdrawal as failed (on-chain transfer failed)
router.post("/withdrawals/:id/fail", async (req: Request, res: Response) => {
  try {
    const withdrawal = await failWithdrawal(req.params.id as string);
    res.json(withdrawal);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
