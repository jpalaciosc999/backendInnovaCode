import { Router } from "express";
import {
  getDescuentos,
  getDescuentoById,
  createDescuento,
  updateDescuento,
  deleteDescuento
} from "./descuentos.controller.js";

const router = Router();

router.get("/", getDescuentos);
router.get("/:id", getDescuentoById);
router.post("/", createDescuento);
router.put("/:id", updateDescuento);
router.delete("/:id", deleteDescuento);

export default router;