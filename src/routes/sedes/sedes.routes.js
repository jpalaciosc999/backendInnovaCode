import { Router } from "express";
import {
  getSedes,
  getSedeById,
  createSede,
  updateSede,
  deleteSede
} from "./sedes.controller.js";

const router = Router();

router.get("/", getSedes);
router.get("/:id", getSedeById);
router.post("/", createSede);
router.put("/:id", updateSede);
router.delete("/:id", deleteSede);

export default router;