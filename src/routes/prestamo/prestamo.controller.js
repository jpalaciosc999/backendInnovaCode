import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER PRESTAMOS
======================= */
export async function getPrestamos(req, res) {
  try {
    const sql = `SELECT * FROM NOM_PRESTAMO`;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo préstamos",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getPrestamoById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT * FROM NOM_PRESTAMO
      WHERE PRE_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Préstamo no encontrado"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo préstamo",
      error: error.message
    });
  }
}

/* =======================
   CREAR
======================= */
export async function createPrestamo(req, res) {
  try {
    const {
      monto_total,
      interes,
      plazo,
      cuota_mensual,
      saldo_pendiente,
      fecha_inicio,
      estado,
      pde_id
    } = req.body;

    const sql = `
      INSERT INTO NOM_PRESTAMO (
        PRE_ID,
        PRE_MONTO_TOTAL,
        PRE_INTERES,
        PRE_PLAZO,
        PRE_CUOTA_MENSUAL,
        PRE_SALDO_PENDIENTE,
        PRE_FECHA_INICIO,
        PRE_ESTADO,
        PDE_ID
      ) VALUES (
        NOM_PRESTAMO_SEQ.NEXTVAL,
        :monto_total,
        :interes,
        :plazo,
        :cuota_mensual,
        :saldo_pendiente,
        :fecha_inicio,
        :estado,
        :pde_id
      )
    `;

    await executeQuery(sql, {
      monto_total,
      interes,
      plazo,
      cuota_mensual,
      saldo_pendiente,
      fecha_inicio,
      estado,
      pde_id
    });

    res.status(201).json({
      message: "Préstamo creado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creando préstamo",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR
======================= */
export async function updatePrestamo(req, res) {
  try {
    const { id } = req.params;
    const {
      monto_total,
      interes,
      plazo,
      cuota_mensual,
      saldo_pendiente,
      fecha_inicio,
      estado,
      pde_id
    } = req.body;

    const sql = `
      UPDATE NOM_PRESTAMO
      SET 
        PRE_MONTO_TOTAL = :monto_total,
        PRE_INTERES = :interes,
        PRE_PLAZO = :plazo,
        PRE_CUOTA_MENSUAL = :cuota_mensual,
        PRE_SALDO_PENDIENTE = :saldo_pendiente,
        PRE_FECHA_INICIO = :fecha_inicio,
        PRE_ESTADO = :estado,
        PDE_ID = :pde_id
      WHERE PRE_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      monto_total,
      interes,
      plazo,
      cuota_mensual,
      saldo_pendiente,
      fecha_inicio,
      estado,
      pde_id
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Préstamo no encontrado"
      });
    }

    res.json({
      message: "Préstamo actualizado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando préstamo",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR
======================= */
export async function deletePrestamo(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM NOM_PRESTAMO
      WHERE PRE_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({
        message: "Préstamo no encontrado"
      });
    }

    res.json({
      message: "Préstamo eliminado correctamente"
    });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando préstamo",
      error: error.message
    });
  }
}