import { Router } from 'express';
import { registrarMarcaje, getHistorial, updateMarcaje } from './marcaje.controller.js';

const router = Router();

router.post('/registrar', registrarMarcaje);
router.get('/historial', getHistorial);
router.put('/:id', updateMarcaje);

import { Router } from "express";
import {
  getMarcajes,
  getMarcajeById,
  createMarcaje,
  registrarMarcaje,
  getHistorial,
  updateMarcaje,
  deleteMarcaje
} from "./marcaje.controller.js";

const router = Router();

router.get("/", getMarcajes);
router.get("/historial", getHistorial);
router.get("/:id", getMarcajeById);

router.post("/", createMarcaje);
router.post("/registrar", registrarMarcaje);

router.put("/:id", updateMarcaje);
router.delete("/:id", deleteMarcaje);

export default router;
