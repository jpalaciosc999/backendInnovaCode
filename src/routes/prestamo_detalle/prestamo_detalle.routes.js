import express from "express";
import {
  getPrestamoDetalles,
  getPrestamoDetalleById,
  createPrestamoDetalle,
  updatePrestamoDetalle,
  deletePrestamoDetalle
} from "./prestamo_detalle.controller.js";

const router = express.Router();

router.get("/", getPrestamoDetalles);
router.get("/:id", getPrestamoDetalleById);
router.post("/", createPrestamoDetalle);
router.put("/:id", updatePrestamoDetalle);
router.delete("/:id", deletePrestamoDetalle);

export default router;