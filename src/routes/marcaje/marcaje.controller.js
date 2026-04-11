import { executeQuery } from "../../config/db.js";

/* =======================
   FUNCIONES AUXILIARES
======================= */
function calcularMinutosEntreFechas(fechaInicio, fechaFin) {
  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFin);

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
    throw new Error("Fechas inválidas");
  }

  return Math.round((fin.getTime() - inicio.getTime()) / 60000);
}

function calcularMinutosHorario(horaInicio, horaFin) {
  const [hi, mi] = String(horaInicio).split(":").map(Number);
  const [hf, mf] = String(horaFin).split(":").map(Number);

  let inicio = hi * 60 + mi;
  let fin = hf * 60 + mf;

  if (fin < inicio) {
    fin += 24 * 60;
  }

  return fin - inicio;
}

async function obtenerMinutosProgramadosEmpleado(emp_id) {
  const sqlHorario = `
    SELECT 
      H.HOR_HORA_INICIO,
      H.HOR_HORA_FIN
    FROM EMP_EMPLEADO E
    LEFT JOIN EMP_HORARIO H ON H.HOR_ID = E.HOR_ID
    WHERE E.EMP_ID = :emp_id
  `;

  const result = await executeQuery(sqlHorario, { emp_id: Number(emp_id) });

  if (
    result.rows.length === 0 ||
    !result.rows[0].HOR_HORA_INICIO ||
    !result.rows[0].HOR_HORA_FIN
  ) {
    return 0;
  }

  return calcularMinutosHorario(
    result.rows[0].HOR_HORA_INICIO,
    result.rows[0].HOR_HORA_FIN
  );
}

/* =======================
   OBTENER TODOS
======================= */
export async function getMarcajes(req, res) {
  try {
    const sql = `
      SELECT 
        M.*,
        E.EMP_NOMBRE,
        E.EMP_APELLIDO
      FROM EMP_MARCAJE M
      LEFT JOIN EMP_EMPLEADO E ON E.EMP_ID = M.EMP_ID
      ORDER BY M.MAR_FECHA DESC, M.MAR_ID DESC
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo marcajes",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getMarcajeById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT 
        M.*,
        E.EMP_NOMBRE,
        E.EMP_APELLIDO
      FROM EMP_MARCAJE M
      LEFT JOIN EMP_EMPLEADO E ON E.EMP_ID = M.EMP_ID
      WHERE M.MAR_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Marcaje no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo marcaje",
      error: error.message
    });
  }
}

/* =======================
   CREAR
======================= */
export async function createMarcaje(req, res) {
  try {
    const { fecha, entrada, salida, estado, emp_id } = req.body;

    const minutosTrabajados = calcularMinutosEntreFechas(entrada, salida);

    if (minutosTrabajados <= 0) {
      return res.status(400).json({
        message: "La hora de salida debe ser mayor que la hora de entrada"
      });
    }

    const minutosProgramados = await obtenerMinutosProgramadosEmpleado(emp_id);
    const diferenciaMin = minutosTrabajados - minutosProgramados;

    const horasExtra = diferenciaMin > 0
      ? parseFloat((diferenciaMin / 60).toFixed(2))
      : 0;

    const sql = `
      INSERT INTO EMP_MARCAJE (
        MAR_ID,
        MAR_FECHA,
        MAR_ENTRADA,
        MAR_SALIDA,
        MAR_HORAS_EXTRA,
        MAR_ESTADO,
        EMP_ID,
        MAR_HORAS_TRABAJADAS_MIN,
        MAR_DIFERENCIA_MIN
      ) VALUES (
        EMP_MARCAJE_SEQ.NEXTVAL,
        TO_DATE(:fecha, 'YYYY-MM-DD'),
        TO_DATE(:entrada, 'YYYY-MM-DD"T"HH24:MI'),
        TO_DATE(:salida, 'YYYY-MM-DD"T"HH24:MI'),
        :horas_extra,
        :estado,
        :emp_id,
        :horas_trabajadas_min,
        :diferencia_min
      )
    `;

    await executeQuery(sql, {
      fecha,
      entrada,
      salida,
      horas_extra: horasExtra,
      estado: estado || "Normal",
      emp_id: Number(emp_id),
      horas_trabajadas_min: minutosTrabajados,
      diferencia_min: diferenciaMin
    });

    res.status(201).json({
      message: "Marcaje creado correctamente",
      detalles: {
        minutos_trabajados: minutosTrabajados,
        minutos_programados: minutosProgramados,
        diferencia_minutos: diferenciaMin,
        horas_extra_detectadas: horasExtra
      }
    });
  } catch (error) {
    if (error.message.includes("ORA-02291")) {
      return res.status(400).json({
        message: "Error: El ID de empleado no existe. Verifique la tabla de empleados."
      });
    }

    if (error.message.includes("ORA-02289")) {
      return res.status(400).json({
        message: "Error: No existe la secuencia EMP_MARCAJE_SEQ."
      });
    }

    res.status(500).json({
      message: "Error creando marcaje",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR
======================= */
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

    const minutosProgramados = await obtenerMinutosProgramadosEmpleado(emp_id);
    const diferenciaMin = minutosTrabajados - minutosProgramados;

    const horasExtra = diferenciaMin > 0
      ? parseFloat((diferenciaMin / 60).toFixed(2))
      : 0;

    const sql = `
      UPDATE EMP_MARCAJE
      SET 
        MAR_FECHA = TO_DATE(:fecha, 'YYYY-MM-DD'),
        MAR_ENTRADA = TO_DATE(:entrada, 'YYYY-MM-DD"T"HH24:MI'),
        MAR_SALIDA = TO_DATE(:salida, 'YYYY-MM-DD"T"HH24:MI'),
        MAR_HORAS_EXTRA = :horas_extra,
        MAR_ESTADO = :estado,
        EMP_ID = :emp_id,
        MAR_HORAS_TRABAJADAS_MIN = :horas_trabajadas_min,
        MAR_DIFERENCIA_MIN = :diferencia_min
      WHERE MAR_ID = :id
    `;

    const result = await executeQuery(sql, {
      id: Number(id),
      fecha,
      entrada,
      salida,
      horas_extra: horasExtra,
      estado: estado || "Normal",
      emp_id: Number(emp_id),
      horas_trabajadas_min: minutosTrabajados,
      diferencia_min: diferenciaMin
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Marcaje no encontrado" });
    }

    res.json({
      message: "Marcaje actualizado correctamente",
      detalles: {
        minutos_trabajados: minutosTrabajados,
        minutos_programados: minutosProgramados,
        diferencia_minutos: diferenciaMin,
        horas_extra_detectadas: horasExtra
      }
    });
  } catch (error) {
    res.status(500).json({
      message: "Error actualizando marcaje",
      error: error.message
    });
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
    res.status(500).json({
      message: "Error eliminando marcaje",
      error: error.message
    });
  }
}