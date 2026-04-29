import { Router } from 'express';
// Sube un nivel (..) para salir de 'routes' y entra en 'controllers'
// Los dos pares de ../.. son porque estás dentro de src/routes/marcaje/
// Un .. sale de 'marcaje', el otro .. sale de 'routes' para llegar a 'src'
// Como marcaje.controller.js está en la misma carpeta, usamos './'
import { registrarMarcaje, getHistorial, updateMarcaje } from './marcaje.controller.js';

const router = Router();

router.post('/registrar', registrarMarcaje);
router.get('/historial', getHistorial);

// CRÍTICO: Debe tener :id al final para que req.params.id funcione
router.put('/:id', updateMarcaje);

export default router;