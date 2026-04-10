import { Router } from "express";
import {
  getMarcajes,
  getMarcajeById,
  createMarcaje,
  updateMarcaje,
  deleteMarcaje
} from "./marcaje.controller.js";

const router = Router();

router.get("/", getMarcajes);
router.get("/:id", getMarcajeById);
router.post("/", createMarcaje);
router.put("/:id", updateMarcaje);
router.delete("/:id", deleteMarcaje);

export default router;