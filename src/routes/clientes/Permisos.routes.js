import { Router } from "express";
import {
  getPermisos,
  getPermisoById,
  createPermiso,
  updatePermiso,
  deletePermiso
} from "./clientes/permisos.controller.js";

const router = Router();

router.get("/", getPermisos);
router.get("/:id", getPermisoById);
router.post("/", createPermiso);
router.put("/:id", updatePermiso);
router.delete("/:id", deletePermiso);

export default router;