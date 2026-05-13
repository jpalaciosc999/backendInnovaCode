import { Router } from "express";
import {
  getAdminActividad,
  getAdminCatalogo,
  getAdminResumen
} from "./admin.controller.js";
import {
  requiereAlgunoPermiso,
  requierePermiso,
  verificarToken
} from "../../middlewares/auth.middleware.js";

const router = Router();

router.use(verificarToken);

router.get(
  "/resumen",
  requiereAlgunoPermiso(
    { modulo: "REPORTES", permiso: "Ver reportes gerenciales" },
    { modulo: "ADMIN", permiso: "Ver bitacora" }
  ),
  getAdminResumen
);
router.get("/actividad", requierePermiso("ADMIN", "Ver bitacora"), getAdminActividad);
router.get(
  "/catalogo",
  requiereAlgunoPermiso(
    { modulo: "ADMIN", permiso: "Gestionar roles" },
    { modulo: "ADMIN", permiso: "Gestionar permisos" }
  ),
  getAdminCatalogo
);

export default router;
