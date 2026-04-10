import { executeQuery } from "../../config/db.js";

/* =======================
   OBTENER TODOS
======================= */
export async function getMarcajes(req, res) {
  try {
    const sql = `SELECT * FROM EMP_MARCAJE ORDER BY MAR_FECHA DESC`;
    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo marcajes", error: error.message });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getMarcajeById(req, res) {
  try {
    const { id } = req.params;
    const sql = `SELECT * FROM EMP_MARCAJE WHERE MAR_ID = :id`;
    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Marcaje no encontrado" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo marcaje", error: error.message });
  }
}

/* =======================
   CREAR (Con cálculo automático de Horas Extra)
======================= */
export async function createMarcaje(req, res) {
  try {
    const { fecha, entrada, salida, estado, emp_id } = req.body;

    // --- LÓGICA DE CÁLCULO PASO 1 ---
    const dateEntrada = new Date(entrada);
    const dateSalida = new Date(salida);

    // Calculamos la diferencia en horas
    const diffMs = dateSalida - dateEntrada;
    const totalHoras = diffMs / (1000 * 60 * 60);

    // Si excede las 8 horas legales, el resto es hora extra
    const calculoHorasExtra = totalHoras > 8 ? parseFloat((totalHoras - 8).toFixed(2)) : 0;

    const sql = `
      INSERT INTO EMP_MARCAJE (
        MAR_ID,
        MAR_FECHA,
        MAR_ENTRADA,
        MAR_SALIDA,
        MAR_HORAS_EXTRA,
        MAR_ESTADO,
        EMP_ID
      ) VALUES (
        SEQ_EMP_MARCAJE.NEXTVAL,
        TO_DATE(:fecha, 'YYYY-MM-DD'),
        TO_DATE(:entrada, 'YYYY-MM-DD"T"HH24:MI'),
        TO_DATE(:salida, 'YYYY-MM-DD"T"HH24:MI'),
        :horas_extra,
        :estado,
        :emp_id
      )
    `;

    await executeQuery(sql, {
      fecha,
      entrada,
      salida,
      horas_extra: calculoHorasExtra, // Usamos el cálculo automático
      estado: estado || 'Normal',
      emp_id: Number(emp_id)
    });

    res.status(201).json({
      message: "Marcaje creado correctamente",
      detalles: {
        horas_trabajadas: totalHoras.toFixed(2),
        horas_extra_detectadas: calculoHorasExtra
      }
    });

  } catch (error) {
    // Manejo del error de integridad (Si el empleado no existe)
    if (error.message.includes("ORA-02291")) {
      return res.status(400).json({
        message: "Error: El ID de empleado no existe. Verifique la tabla de empleados."
      });
    }
    res.status(500).json({ message: "Error creando marcaje", error: error.message });
  }
}

/* =======================
   ACTUALIZAR
======================= */
export async function updateMarcaje(req, res) {
  try {
    const { id } = req.params;
    const { fecha, entrada, salida, estado, emp_id } = req.body;

    // Recalcular horas extra también al actualizar
    const dateEntrada = new Date(entrada);
    const dateSalida = new Date(salida);
    const totalHoras = (dateSalida - dateEntrada) / (1000 * 60 * 60);
    const calculoHorasExtra = totalHoras > 8 ? parseFloat((totalHoras - 8).toFixed(2)) : 0;

    const sql = `
      UPDATE EMP_MARCAJE
      SET 
        MAR_FECHA = TO_DATE(:fecha, 'YYYY-MM-DD'),
        MAR_ENTRADA = TO_DATE(:entrada, 'YYYY-MM-DD"T"HH24:MI'),
        MAR_SALIDA = TO_DATE(:salida, 'YYYY-MM-DD"T"HH24:MI'),
        MAR_HORAS_EXTRA = :horas_extra,
        MAR_ESTADO = :estado,
        EMP_ID = :emp_id
      WHERE MAR_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      fecha,
      entrada,
      salida,
      horas_extra: calculoHorasExtra,
      estado,
      emp_id: Number(emp_id)
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Marcaje no encontrado" });
    }

    res.json({ message: "Marcaje actualizado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error actualizando marcaje", error: error.message });
  }
}

/* =======================
   ELIMINAR
======================= */
export async function deleteMarcaje(req, res) {
  try {
    const { id } = req.params;
    const sql = `DELETE FROM EMP_MARCAJE WHERE MAR_ID = :id`;
    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Marcaje no encontrado" });
    }

    res.json({ message: "Marcaje eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error eliminando marcaje", error: error.message });
  }
}