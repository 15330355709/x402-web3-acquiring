import { Router, Request, Response } from "express";
import {
  createPaymentLink,
  getPaymentLink,
  listPaymentLinks,
} from "../services/paymentLinkService";
import { config } from "../config";

const router = Router();

// Create payment link
router.post("/", async (req: Request, res: Response) => {
  try {
    const { merchant_id, amount, description } = req.body;

    if (!merchant_id || !amount) {
      res.status(400).json({ error: "merchant_id and amount are required" });
      return;
    }

    if (typeof amount !== "number" || amount <= 0) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }

    const link = await createPaymentLink(merchant_id, amount, description);
    const paymentUrl = `${config.server.baseUrl}/pay/${link.id}`;

    res.status(201).json({ ...link, payment_url: paymentUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get payment status
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const link = await getPaymentLink(req.params.id as string);
    if (!link) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    res.json(link);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List merchant payments
router.get("/merchant/:merchantId", async (req: Request, res: Response) => {
  try {
    const { status, start_date, end_date, page, page_size } = req.query;
    const result = await listPaymentLinks(
      req.params.merchantId as string,
      {
        status: status as string | undefined,
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

export default router;
