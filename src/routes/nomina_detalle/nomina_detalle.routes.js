import express from "express";
import {
  getNominaDetalles,
  getNominaDetalleById,
  createNominaDetalle,
  updateNominaDetalle,
  deleteNominaDetalle
} from "../controllers/nominaDetalle.controller.js";

const router = express.Router();

router.get("/", getNominaDetalles);
router.get("/:id", getNominaDetalleById);
router.post("/", createNominaDetalle);
router.put("/:id", updateNominaDetalle);
router.delete("/:id", deleteNominaDetalle);

export default router;