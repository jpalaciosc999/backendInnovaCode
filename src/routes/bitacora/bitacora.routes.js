import { Router } from "express";
import {
  getBitacora,
  getBitacoraById
} from "./bitacora.controller.js";
import {
  requierePermiso,
  verificarToken
} from "../../middlewares/auth.middleware.js";

const router = Router();

router.use(verificarToken);
router.use(requierePermiso("ADMIN", "Ver bitacora"));

router.get("/", getBitacora);
router.get("/:id", getBitacoraById);

export default router;
