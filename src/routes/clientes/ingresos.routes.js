import { Router } from "express";
import {
  getIngresos,
  getIngresoById,
  createIngreso,
  updateIngreso,
  deleteIngreso
} from "./ingresos.controller.js";

const router = Router();

router.get("/", getIngresos);
router.get("/:id", getIngresoById);
router.post("/", createIngreso);
router.put("/:id", updateIngreso);
router.delete("/:id", deleteIngreso);

export default router;