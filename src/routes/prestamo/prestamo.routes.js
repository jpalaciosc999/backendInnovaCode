import express from "express";
import {
  getPrestamos,
  getPrestamoById,
  createPrestamo,
  updatePrestamo,
  deletePrestamo
} from "../controllers/prestamo.controller.js";

const router = express.Router();

router.get("/", getPrestamos);
router.get("/:id", getPrestamoById);
router.post("/", createPrestamo);
router.put("/:id", updatePrestamo);
router.delete("/:id", deletePrestamo);

export default router;