import { Router } from "express";
import { verificarToken, requiereRolVigente } from "../../middlewares/auth.middleware.js";
import { getDashboardEjecutivo } from "./dashboard_ejecutivo.controller.js";

const router = Router();

router.use(verificarToken);
router.use(requiereRolVigente());

function soloAdminGerencia(req, res, next) {
  const rolNombre = String(req.usuario?.rol_nombre || "").trim().toUpperCase();

  if (rolNombre.includes("ADMIN") || rolNombre.includes("GERENCIA") || rolNombre.includes("GERENTE")) {
    return next();
  }

  return res.status(403).json({
    message: "Este endpoint está permitido solo para roles ADMIN y GERENCIA"
  });
}

router.get("/ejecutivo", soloAdminGerencia, getDashboardEjecutivo);

export default router;
