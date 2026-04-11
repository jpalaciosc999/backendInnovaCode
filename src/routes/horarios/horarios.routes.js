import { Router } from "express";
import {
  getHorarios,
  getHorarioById,
  createHorario,
  updateHorario,
  deleteHorario
} from "./horarios.controller.js";

const router = Router();

router.get("/", getHorarios);
router.get("/:id", getHorarioById);
router.post("/", createHorario);
router.put("/:id", updateHorario);
router.delete("/:id", deleteHorario);

export default router;