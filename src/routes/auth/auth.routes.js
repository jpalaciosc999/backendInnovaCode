import { Router } from "express";
import { login, leerToken } from "./auth.controller.js";

const router = Router();

router.post("/login", login);
router.post("/leer-token", leerToken);

export default router;