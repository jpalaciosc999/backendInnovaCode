import { Router } from "express";
import {
  getRoles,
  getRolById,
  createRol,
  updateRol,
  deleteRol,
  deleteRolPermanente
} from "./Roles.controller.js";
import {
  requierePermiso,
  verificarToken
} from "../../middlewares/auth.middleware.js";

const router = Router();

router.use(verificarToken);
router.use(requierePermiso("ADMIN", "Gestionar roles"));

router.get("/", getRoles);
router.get("/:id", getRolById);
router.post("/", createRol);
router.put("/:id", updateRol);
router.delete("/:id/permanente", deleteRolPermanente);
router.delete("/:id", deleteRol);

export default router;
