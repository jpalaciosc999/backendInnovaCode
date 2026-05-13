import { Router } from "express";
import {
  getRolPermisos,
  getRolPermisoById,
  createRolPermiso,
  updateRolPermiso,
  deleteRolPermiso
} from "./rol_permisos.controller.js";
import {
  requierePermiso,
  verificarToken
} from "../../middlewares/auth.middleware.js";

const router = Router();

router.use(verificarToken);
router.use(requierePermiso("ADMIN", "Gestionar permisos"));

router.get("/", getRolPermisos);
router.get("/:id", getRolPermisoById);
router.post("/", createRolPermiso);
router.put("/:id", updateRolPermiso);
router.delete("/:id", deleteRolPermiso);

export default router;
