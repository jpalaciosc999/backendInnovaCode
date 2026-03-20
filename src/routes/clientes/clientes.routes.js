import { Router } from "express";
import {
  getClientes,
  getClienteById,
  createCliente,
  updateCliente,
  deleteCliente
} from "./clientes.controller.js";

const router = Router();

router.get("/", getClientes);
router.get("/:id", getClienteById);
router.post("/", createCliente);
router.put("/:id", updateCliente);
router.delete("/:id", deleteCliente);

export default router;