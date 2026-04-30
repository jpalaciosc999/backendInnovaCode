import { executeQuery } from "../../config/db.js";

// REGISTRAR ENTRADA O SALIDA (Puntos 2, 3 y 4 del PDF)
export async function registrarMarcaje(req, res) {
  try {
    // PUNTO 1 & 2: Solo recibimos el ID. 
    // No recibimos fecha del body para evitar que el usuario la manipule.
    const { emp_id } = req.body;

    if (!emp_id) {
      return res.status(400).json({ message: "ID de empleado es requerido" });
    }

    // Verificamos si ya existe un registro para HOY usando la fecha del servidor TRUNC(SYSDATE)
    const sqlCheck = `
      SELECT MAR_ID, MAR_ENTRADA, MAR_SALIDA 
      FROM EMP_MARCAJE 
      WHERE EMP_ID = :emp_id 
      AND TRUNC(MAR_FECHA) = TRUNC(SYSDATE)
    `;
    const checkResult = await executeQuery(sqlCheck, { emp_id });

    if (checkResult.rows.length === 0) {
      // --- INSERTAR ENTRADA ---
      // Usamos SYSDATE para MAR_FECHA y MAR_ENTRADA (Punto 3: Automático)
      // Prueba quitando la secuencia si te da error, o asegúrate de que se llame así
      const sqlInsert = `
        INSERT INTO EMP_MARCAJE (MAR_ID, MAR_FECHA, MAR_ENTRADA, EMP_ID, MAR_AUTORIZACION)
        VALUES (EMP_MARCAJE_SEQ.NEXTVAL, TRUNC(SYSDATE), SYSDATE, :emp_id, 0)
      `;
      await executeQuery(sqlInsert, { emp_id });
      return res.status(201).json({ message: "Entrada registrada con éxito" });

    } else {
      const registro = checkResult.rows[0];

      // Si ya tiene entrada pero NO tiene salida, registramos la salida
      if (!registro.MAR_SALIDA) {
        // --- ACTUALIZAR SALIDA ---
        const sqlUpdate = `
          UPDATE EMP_MARCAJE 
          SET MAR_SALIDA = SYSDATE 
          WHERE MAR_ID = :id
        `;
        await executeQuery(sqlUpdate, { id: registro.MAR_ID });
        return res.json({ message: "Salida registrada con éxito" });
      }

      // Si ya tiene entrada y salida (Punto 3: No permite más de 2 marcajes)
      return res.status(400).json({ message: "Ya has completado tu jornada de hoy (Entrada y Salida registradas)" });
    }
  } catch (error) {
    console.error("Error en registrarMarcaje:", error);
    res.status(500).json({ message: "Error en el servidor", error: error.message });
  }
}

// OBTENER HISTORIAL (Punto 5 del PDF - 15 días)
export async function getHistorial(req, res) {
  try {
    const { emp_id, offset = 0 } = req.query;

    // Traemos los datos asegurándonos de incluir el estado de autorización
    const sql = `
      SELECT * FROM (
        SELECT M.MAR_ID, M.MAR_FECHA, M.MAR_ENTRADA, M.MAR_SALIDA, M.MAR_AUTORIZACION,
               E.EMP_NOMBRE, E.EMP_APELLIDO
        FROM EMP_MARCAJE M
        JOIN EMP_EMPLEADO E ON E.EMP_ID = M.EMP_ID
        WHERE M.EMP_ID = :emp_id
        ORDER BY M.MAR_FECHA DESC
      ) OFFSET :offset ROWS FETCH NEXT 15 ROWS ONLY
    `;
    const result = await executeQuery(sql, { emp_id: Number(emp_id), offset: Number(offset) });
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo historial", error: error.message });
  }
}

// --- FUNCIONES PARA ADMINISTRACIÓN (Punto 6: Autorización) ---

export async function getMarcajeById(req, res) {
  try {
    const { id } = req.params;
    const result = await executeQuery(`SELECT * FROM EMP_MARCAJE WHERE MAR_ID = :id`, { id });
    res.json(result.rows[0] || { message: "No encontrado" });
  } catch (error) { res.status(500).json({ error: error.message }); }
}

export async function updateMarcaje(req, res) {
  try {
    const { id } = req.params; // Viene de la URL /marcaje/ID
    const { autorizacion } = req.body; // Viene del cuerpo { autorizacion: 1 }

    if (![1, 2].includes(Number(autorizacion))) {
      return res.status(400).json({
        message: "La autorizacion debe ser 1 para autorizar o 2 para rechazar"
      });
    }

    if (Number(autorizacion) === 1) {
      const sqlValidacion = `
        SELECT
          M.MAR_ID,
          M.MAR_SALIDA,
          CASE
            WHEN M.MAR_SALIDA IS NULL THEN 0
            WHEN M.MAR_SALIDA > (
              TRUNC(M.MAR_ENTRADA)
              + (
                TO_DATE(SUBSTR(NVL(H.HOR_HORA_FIN, '18:00'), 1, 5), 'HH24:MI')
                - TRUNC(TO_DATE(SUBSTR(NVL(H.HOR_HORA_FIN, '18:00'), 1, 5), 'HH24:MI'))
              )
              + CASE
                  WHEN H.HOR_HORA_INICIO IS NOT NULL
                   AND H.HOR_HORA_FIN IS NOT NULL
                   AND TO_DATE(SUBSTR(H.HOR_HORA_FIN, 1, 5), 'HH24:MI') <= TO_DATE(SUBSTR(H.HOR_HORA_INICIO, 1, 5), 'HH24:MI')
                  THEN 1
                  ELSE 0
                END
            ) THEN 1
            ELSE 0
          END AS TIENE_HORA_EXTRA
        FROM EMP_MARCAJE M
        JOIN EMP_EMPLEADO E ON E.EMP_ID = M.EMP_ID
        LEFT JOIN EMP_HORARIO H ON H.HOR_ID = E.HOR_ID
        WHERE M.MAR_ID = :id
      `;

      const validacion = await executeQuery(sqlValidacion, { id });
      const marcaje = validacion.rows[0];

      if (!marcaje) {
        return res.status(404).json({ message: "Marcaje no encontrado" });
      }

      if (marcaje.TIENE_HORA_EXTRA !== 1) {
        return res.status(400).json({
          message: "Solo se pueden autorizar marcajes con diferencia positiva de horas extra"
        });
      }

    res.status(500).json({
      message: "Error creando marcaje",
      error: error.message
    });
  }
}

export async function registrarMarcaje(req, res) {
  return createMarcaje(req, res);
}

export async function getHistorial(req, res) {
  return getMarcajes(req, res);
}

export async function updateMarcaje(req, res) {
  try {
    const { id } = req.params;
    const { fecha, entrada, salida, estado, emp_id } = req.body;

    const minutosTrabajados = calcularMinutosEntreFechas(entrada, salida);

    if (minutosTrabajados <= 0) {
      return res.status(400).json({
        message: "La hora de salida debe ser mayor que la hora de entrada"
      });
    }

    const sqlUpdate = `
      UPDATE EMP_MARCAJE 
      SET MAR_AUTORIZACION = :autorizacion 
      WHERE MAR_ID = :id
    `;

    await executeQuery(sqlUpdate, { autorizacion, id });
    res.json({ message: "Actualizado correctamente" });
  } catch (error) {
    console.error("Error en updateMarcaje:", error);
    res.status(500).json({ message: "Error al actualizar", error: error.message });
  }
}

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
    res.status(500).json({
      message: "Error eliminando marcaje",
      error: error.message
    });
  }
}

