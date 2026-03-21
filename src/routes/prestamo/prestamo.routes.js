import { Router } from "express";
import {
  getPrestamos,
  getPrestamoById,
  createPrestamo,
  updatePrestamo,
  deletePrestamo
} from "./prestamo.controller.js";

const router = Router();

router.get("/", getPrestamos);
router.get("/:id", getPrestamoById);
router.post("/", createPrestamo);
router.put("/:id", updatePrestamo);
router.delete("/:id", deletePrestamo);

export default router;