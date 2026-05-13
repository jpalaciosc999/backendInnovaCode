import { Router } from "express";
import {
  getUsuarioBitacoras,
  getUsuarioBitacoraById
} from "./usuarioBitacora.controller.js";
import {
  requierePermiso,
  verificarToken
} from "../../middlewares/auth.middleware.js";

const router = Router();

router.use(verificarToken);
router.use(requierePermiso("ADMIN", "Ver bitacora"));

router.get("/", getUsuarioBitacoras);
router.get("/:id", getUsuarioBitacoraById);

export default router;
