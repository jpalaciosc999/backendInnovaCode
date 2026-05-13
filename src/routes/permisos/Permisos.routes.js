import { Router } from "express";
import {
  getPermisos,
  getPermisoById,
  createPermiso,
  updatePermiso,
  deletePermiso
} from "./Permisos.controller.js";
import {
  requierePermiso,
  verificarToken
} from "../../middlewares/auth.middleware.js";

const router = Router();

router.use(verificarToken);
router.use(requierePermiso("ADMIN", "Gestionar permisos"));

router.get("/", getPermisos);
router.get("/:id", getPermisoById);
router.post("/", createPermiso);
router.put("/:id", updatePermiso);
router.delete("/:id", deletePermiso);

export default router;
