import { executeQuery } from "../../config/db.js";

// LISTAR MARCAJES
export async function getMarcajes(req, res) {
  try {
    const sql = `
      SELECT 
        M.MAR_ID,
        M.MAR_FECHA,
        M.MAR_ENTRADA,
        M.MAR_SALIDA,
        M.MAR_AUTORIZACION,
        M.EMP_ID,
        E.EMP_NOMBRE,
        E.EMP_APELLIDO
      FROM EMP_MARCAJE M
      JOIN EMP_EMPLEADO E ON E.EMP_ID = M.EMP_ID
      ORDER BY M.MAR_FECHA DESC, M.MAR_ID DESC
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    console.error("Error en getMarcajes:", error);
    res.status(500).json({
      message: "Error obteniendo marcajes",
      error: error.message
    });
  }
}

// OBTENER MARCAJE POR ID
export async function getMarcajeById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT 
        M.MAR_ID,
        M.MAR_FECHA,
        M.MAR_ENTRADA,
        M.MAR_SALIDA,
        M.MAR_AUTORIZACION,
        M.EMP_ID,
        E.EMP_NOMBRE,
        E.EMP_APELLIDO
      FROM EMP_MARCAJE M
      JOIN EMP_EMPLEADO E ON E.EMP_ID = M.EMP_ID
      WHERE M.MAR_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Marcaje no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error en getMarcajeById:", error);
    res.status(500).json({
      message: "Error obteniendo marcaje",
      error: error.message
    });
  }
}

// CREAR MARCAJE MANUAL
export async function createMarcaje(req, res) {
  try {
    const { emp_id, fecha, entrada, salida, autorizacion = 0 } = req.body;

    if (!emp_id) {
      return res.status(400).json({ message: "ID de empleado es requerido" });
    }

    const sql = `
      INSERT INTO EMP_MARCAJE (
        MAR_ID,
        MAR_FECHA,
        MAR_ENTRADA,
        MAR_SALIDA,
        EMP_ID,
        MAR_AUTORIZACION
      )
      VALUES (
        EMP_MARCAJE_SEQ.NEXTVAL,
        NVL(TO_DATE(:fecha, 'YYYY-MM-DD'), TRUNC(SYSDATE)),
        TO_DATE(:entrada, 'YYYY-MM-DD HH24:MI:SS'),
        TO_DATE(:salida, 'YYYY-MM-DD HH24:MI:SS'),
        :emp_id,
        :autorizacion
      )
    `;

    await executeQuery(sql, {
      emp_id: Number(emp_id),
      fecha: fecha || null,
      entrada: entrada || null,
      salida: salida || null,
      autorizacion: Number(autorizacion)
    });

    res.status(201).json({ message: "Marcaje creado correctamente" });
  } catch (error) {
    console.error("Error en createMarcaje:", error);
    res.status(500).json({
      message: "Error creando marcaje",
      error: error.message
    });
  }
}

// REGISTRAR ENTRADA O SALIDA AUTOMÁTICA
export async function registrarMarcaje(req, res) {
  try {
    const { emp_id } = req.body;

    if (!emp_id) {
      return res.status(400).json({ message: "ID de empleado es requerido" });
    }

    const sqlCheck = `
      SELECT MAR_ID, MAR_ENTRADA, MAR_SALIDA
      FROM EMP_MARCAJE
      WHERE EMP_ID = :emp_id
      AND TRUNC(MAR_FECHA) = TRUNC(SYSDATE)
    `;

    const checkResult = await executeQuery(sqlCheck, {
      emp_id: Number(emp_id)
    });

    if (checkResult.rows.length === 0) {
      const sqlInsert = `
        INSERT INTO EMP_MARCAJE (
          MAR_ID,
          MAR_FECHA,
          MAR_ENTRADA,
          EMP_ID,
          MAR_AUTORIZACION
        )
        VALUES (
          EMP_MARCAJE_SEQ.NEXTVAL,
          TRUNC(SYSDATE),
          SYSDATE,
          :emp_id,
          0
        )
      `;

      await executeQuery(sqlInsert, {
        emp_id: Number(emp_id)
      });

      return res.status(201).json({
        message: "Entrada registrada con éxito"
      });
    }

    const registro = checkResult.rows[0];

    if (!registro.MAR_SALIDA) {
      const sqlUpdate = `
        UPDATE EMP_MARCAJE
        SET MAR_SALIDA = SYSDATE
        WHERE MAR_ID = :id
      `;

      await executeQuery(sqlUpdate, {
        id: registro.MAR_ID
      });

      return res.json({
        message: "Salida registrada con éxito"
      });
    }

    return res.status(400).json({
      message: "Ya has completado tu jornada de hoy"
    });
  } catch (error) {
    console.error("Error en registrarMarcaje:", error);
    res.status(500).json({
      message: "Error en el servidor",
      error: error.message
    });
  }
}

// HISTORIAL POR EMPLEADO
export async function getHistorial(req, res) {
  try {
    const { emp_id, offset = 0 } = req.query;

    if (!emp_id) {
      return res.status(400).json({ message: "ID de empleado es requerido" });
    }

    const sql = `
      SELECT *
      FROM (
        SELECT 
          M.MAR_ID,
          M.MAR_FECHA,
          M.MAR_ENTRADA,
          M.MAR_SALIDA,
          M.MAR_AUTORIZACION,
          E.EMP_NOMBRE,
          E.EMP_APELLIDO
        FROM EMP_MARCAJE M
        JOIN EMP_EMPLEADO E ON E.EMP_ID = M.EMP_ID
        WHERE M.EMP_ID = :emp_id
        ORDER BY M.MAR_FECHA DESC
      )
      OFFSET :offset ROWS FETCH NEXT 15 ROWS ONLY
    `;

    const result = await executeQuery(sql, {
      emp_id: Number(emp_id),
      offset: Number(offset)
    });

    res.json(result.rows);
  } catch (error) {
    console.error("Error en getHistorial:", error);
    res.status(500).json({
      message: "Error obteniendo historial",
      error: error.message
    });
  }
}

// ACTUALIZAR AUTORIZACIÓN
export async function updateMarcaje(req, res) {
  try {
    const { id } = req.params;
    const { autorizacion } = req.body;

    if (![1, 2].includes(Number(autorizacion))) {
      return res.status(400).json({
        message: "La autorización debe ser 1 para autorizar o 2 para rechazar"
      });
    }

    const existe = await executeQuery(
      `SELECT MAR_ID FROM EMP_MARCAJE WHERE MAR_ID = :id`,
      { id: Number(id) }
    );

    if (existe.rows.length === 0) {
      return res.status(404).json({ message: "Marcaje no encontrado" });
    }

    const sqlUpdate = `
      UPDATE EMP_MARCAJE
      SET MAR_AUTORIZACION = :autorizacion
      WHERE MAR_ID = :id
    `;

    await executeQuery(sqlUpdate, {
      autorizacion: Number(autorizacion),
      id: Number(id)
    });

    res.json({ message: "Marcaje actualizado correctamente" });
  } catch (error) {
    console.error("Error en updateMarcaje:", error);
    res.status(500).json({
      message: "Error actualizando marcaje",
      error: error.message
    });
  }
}

// ELIMINAR MARCAJE
export async function deleteMarcaje(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      DELETE FROM EMP_MARCAJE
      WHERE MAR_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id)
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Marcaje no encontrado" });
    }

    res.json({ message: "Marcaje eliminado correctamente" });
  } catch (error) {
    console.error("Error en deleteMarcaje:", error);
    res.status(500).json({
      message: "Error eliminando marcaje",
      error: error.message
    });
  }
}