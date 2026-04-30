import { Router } from "express";
import { login, readToken } from "./auth.controller.js";

const router = Router();

router.post("/login", login);
router.post("/readtoken", readToken);

export default router;