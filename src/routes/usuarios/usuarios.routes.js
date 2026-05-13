import { Router } from "express";
import {
  getUsuarios,
  getUsuarioById,
  createUsuario,
  updateUsuario,
  deleteUsuario
} from "./usuarios.controller.js";
import {
  requierePermiso,
  verificarToken
} from "../../middlewares/auth.middleware.js";

const router = Router();

router.use(verificarToken);
router.use(requierePermiso("ADMIN", "Gestionar usuarios"));

router.get("/", getUsuarios);
router.get("/:id", getUsuarioById);
router.post("/", createUsuario);
router.put("/:id", updateUsuario);
router.delete("/:id", deleteUsuario);

export default router;
