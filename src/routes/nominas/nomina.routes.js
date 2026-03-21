import express from "express";
import {
  getNominas,
  getNominaById,
  createNomina,
  updateNomina,
  deleteNomina
} from "./nomina.controller.js";

const router = express.Router();

router.get("/", getNominas);
router.get("/:id", getNominaById);
router.post("/", createNomina);
router.put("/:id", updateNomina);
router.delete("/:id", deleteNomina);

export default router;