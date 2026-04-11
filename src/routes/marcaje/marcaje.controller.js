import { executeQuery } from "../../config/db.js";

/* =======================
   FUNCIONES AUXILIARES
======================= */
function calcularMinutosEntreFechas(inicio, fin) {
  const fechaInicio = new Date(inicio);
  const fechaFin = new Date(fin);
  return Math.round((fechaFin.getTime() - fechaInicio.getTime()) / 60000);
}

function calcularMinutosHorario(horaInicio, horaFin) {
  const [hi, mi] = horaInicio.split(":").map(Number);
  const [hf, mf] = horaFin.split(":").map(Number);

  let inicio = hi * 60 + mi;
  let fin = hf * 60 + mf;

  if (fin < inicio) {
    fin += 24 * 60;
  }

  return fin - inicio;
}

function redondearHoras(minutos) {
  return parseFloat((minutos / 60).toFixed(2));
}

/* =======================
   OBTENER TODOS
======================= */
export async function getMarcajes(req, res) {
  try {
    const sql = `
      SELECT
        M.MAR_ID,
        M.MAR_FECHA,
        M.MAR_ENTRADA,
        M.MAR_SALIDA,
        M.MAR_HORAS_EXTRA,
        M.MAR_ESTADO,
        M.EMP_ID,
        E.EMP_NOMBRE,
        E.EMP_APELLIDO,
        H.HOR_DESCRIPCION
      FROM EMP_MARCAJE M
      LEFT JOIN EMP_EMPLEADO E ON E.EMP_ID = M.EMP_ID
      LEFT JOIN EMP_HORARIO H ON H.HOR_ID = E.HOR_ID
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
        M.MAR_ID,
        M.MAR_FECHA,
        M.MAR_ENTRADA,
        M.MAR_SALIDA,
        M.MAR_HORAS_EXTRA,
        M.MAR_ESTADO,
        M.EMP_ID,
        E.EMP_NOMBRE,
        E.EMP_APELLIDO,
        H.HOR_DESCRIPCION
      FROM EMP_MARCAJE M
      LEFT JOIN EMP_EMPLEADO E ON E.EMP_ID = M.EMP_ID
      LEFT JOIN EMP_HORARIO H ON H.HOR_ID = E.HOR_ID
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

    if (!fecha || !entrada || !salida || !emp_id) {
      return res.status(400).json({
        message: "Datos incompletos",
        error: "Fecha, entrada, salida y empleado son obligatorios"
      });
    }

    const empleadoSql = `
      SELECT
        E.EMP_ID,
        E.HOR_ID,
        H.HOR_DESCRIPCION,
        H.HOR_HORA_INICIO,
        H.HOR_HORA_FIN
      FROM EMP_EMPLEADO E
      LEFT JOIN EMP_HORARIO H ON H.HOR_ID = E.HOR_ID
      WHERE E.EMP_ID = :emp_id
    `;

    const empleadoResult = await executeQuery(empleadoSql, {
      emp_id: Number(emp_id)
    });

    if (empleadoResult.rows.length === 0) {
      return res.status(404).json({
        message: "Empleado no encontrado"
      });
    }

    const empleado = empleadoResult.rows[0];

    if (!empleado.HOR_ID || !empleado.HOR_HORA_INICIO || !empleado.HOR_HORA_FIN) {
      return res.status(400).json({
        message: "El empleado no tiene un horario asignado"
      });
    }

    const minutosTrabajados = calcularMinutosEntreFechas(entrada, salida);

    if (minutosTrabajados <= 0) {
      return res.status(400).json({
        message: "La hora de salida debe ser mayor que la hora de entrada"
      });
    }

    const minutosProgramados = calcularMinutosHorario(
      empleado.HOR_HORA_INICIO,
      empleado.HOR_HORA_FIN
    );

    const diferenciaMinutos = minutosTrabajados - minutosProgramados;
    const calculoHorasExtra = redondearHoras(diferenciaMinutos);

    const sql = `
      INSERT INTO EMP_MARCAJE (
        MAR_ID,
        MAR_FECHA,
        MAR_ENTRADA,
        MAR_SALIDA,
        MAR_HORAS_EXTRA,
        MAR_ESTADO,
        EMP_ID
      )
      VALUES (
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
      horas_extra: calculoHorasExtra,
      estado: estado || 'Normal',
      emp_id: Number(emp_id)
    });

    res.status(201).json({
      message: "Marcaje creado correctamente",
      detalles: {
        horario: empleado.HOR_DESCRIPCION,
        minutos_trabajados: minutosTrabajados,
        minutos_programados: minutosProgramados,
        diferencia_minutos: diferenciaMinutos,
        horas_diferencia: calculoHorasExtra
      }
    });
  } catch (error) {
    if (error.message.includes("ORA-02291")) {
      return res.status(400).json({
        message: "Error: El empleado no existe o tiene datos relacionados inválidos."
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

    if (!fecha || !entrada || !salida || !emp_id) {
      return res.status(400).json({
        message: "Datos incompletos",
        error: "Fecha, entrada, salida y empleado son obligatorios"
      });
    }

    const empleadoSql = `
      SELECT
        E.EMP_ID,
        E.HOR_ID,
        H.HOR_DESCRIPCION,
        H.HOR_HORA_INICIO,
        H.HOR_HORA_FIN
      FROM EMP_EMPLEADO E
      LEFT JOIN EMP_HORARIO H ON H.HOR_ID = E.HOR_ID
      WHERE E.EMP_ID = :emp_id
    `;

    const empleadoResult = await executeQuery(empleadoSql, {
      emp_id: Number(emp_id)
    });

    if (empleadoResult.rows.length === 0) {
      return res.status(404).json({
        message: "Empleado no encontrado"
      });
    }

    const empleado = empleadoResult.rows[0];

    if (!empleado.HOR_ID || !empleado.HOR_HORA_INICIO || !empleado.HOR_HORA_FIN) {
      return res.status(400).json({
        message: "El empleado no tiene un horario asignado"
      });
    }

    const minutosTrabajados = calcularMinutosEntreFechas(entrada, salida);

    if (minutosTrabajados <= 0) {
      return res.status(400).json({
        message: "La hora de salida debe ser mayor que la hora de entrada"
      });
    }

    const minutosProgramados = calcularMinutosHorario(
      empleado.HOR_HORA_INICIO,
      empleado.HOR_HORA_FIN
    );

    const diferenciaMinutos = minutosTrabajados - minutosProgramados;
    const calculoHorasExtra = redondearHoras(diferenciaMinutos);

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
      estado: estado || 'Normal',
      emp_id: Number(emp_id)
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Marcaje no encontrado" });
    }

    res.json({
      message: "Marcaje actualizado correctamente",
      detalles: {
        horario: empleado.HOR_DESCRIPCION,
        minutos_trabajados: minutosTrabajados,
        minutos_programados: minutosProgramados,
        diferencia_minutos: diferenciaMinutos,
        horas_diferencia: calculoHorasExtra
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