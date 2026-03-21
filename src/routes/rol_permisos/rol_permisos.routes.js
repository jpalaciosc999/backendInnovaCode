import { Router } from "express";
import {
  getRolPermisos,
  getRolPermisoById,
  createRolPermiso,
  updateRolPermiso,
  deleteRolPermiso
} from "./rol_permisos.controller.js";

const router = Router();

router.get("/", getRolPermisos);
router.get("/:id", getRolPermisoById);
router.post("/", createRolPermiso);
router.put("/:id", updateRolPermiso);
router.delete("/:id", deleteRolPermiso);

export default router;