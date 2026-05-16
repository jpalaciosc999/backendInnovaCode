import PDFDocument from "pdfkit";
import { executeQuery } from "../../config/db.js";

const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function getDayName(fechaStr) {
  const [y, m, d] = fechaStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return DAY_NAMES[date.getDay()];
}

// GET /api/reportes/marcajes
export async function getMarcajesReporte(req, res) {
  try {
    const { empleadoId, departamentoId, fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({
        message: "Los parámetros fechaInicio y fechaFin son requeridos"
      });
    }

    // ── Construir WHERE dinámico ──────────────────────────────────────────────
    const conditions = [
      "M.MAR_FECHA >= TO_DATE(:fechaInicio, 'YYYY-MM-DD')",
      "M.MAR_FECHA <  TO_DATE(:fechaFin,    'YYYY-MM-DD') + 1"
    ];
    const binds = { fechaInicio, fechaFin };

    if (empleadoId) {
      conditions.push("E.EMP_ID = :empleadoId");
      binds.empleadoId = Number(empleadoId);
    }

    if (departamentoId) {
      conditions.push("E.DEP_ID = :departamentoId");
      binds.departamentoId = Number(departamentoId);
    }

    const whereClause = conditions.join(" AND ");

    // ── Query principal de marcajes ───────────────────────────────────────────
    const sqlMarcajes = `
      SELECT
        M.MAR_ID,
        E.EMP_ID,
        E.EMP_NOMBRE || ' ' || E.EMP_APELLIDO                    AS EMPLEADO,
        UPPER(SUBSTR(E.EMP_NOMBRE, 1, 1)
              || SUBSTR(E.EMP_APELLIDO, 1, 1))                   AS INICIALES,
        TO_CHAR(M.MAR_FECHA,   'YYYY-MM-DD')                     AS FECHA,
        TO_CHAR(M.MAR_ENTRADA, 'HH24:MI')                        AS ENTRADA,
        TO_CHAR(M.MAR_SALIDA,  'HH24:MI')                        AS SALIDA,
        CASE
          WHEN M.MAR_ENTRADA IS NOT NULL AND M.MAR_SALIDA IS NOT NULL THEN
            FLOOR((M.MAR_SALIDA - M.MAR_ENTRADA) * 24) || 'h ' ||
            LPAD(MOD(ROUND((M.MAR_SALIDA - M.MAR_ENTRADA) * 1440), 60), 2, '0') || 'm'
          ELSE NULL
        END                                                       AS HORAS_TRABAJADAS,
        CASE
          WHEN M.MAR_ENTRADA IS NULL THEN 'Ausente'
          WHEN H.HOR_HORA_INICIO IS NULL THEN 'Puntual'
          WHEN (  TO_NUMBER(TO_CHAR(M.MAR_ENTRADA, 'HH24')) * 60
                + TO_NUMBER(TO_CHAR(M.MAR_ENTRADA, 'MI'))) <=
               (  TO_NUMBER(SUBSTR(H.HOR_HORA_INICIO, 1, 2)) * 60
                + TO_NUMBER(SUBSTR(H.HOR_HORA_INICIO, 4, 2)) + 10)
          THEN 'Puntual'
          ELSE 'Tardanza'
        END                                                       AS ESTADO,
        D.DEP_NOMBRE                                              AS DEPARTAMENTO
      FROM EMP_MARCAJE M
      JOIN  EMP_EMPLEADO    E ON E.EMP_ID  = M.EMP_ID
      LEFT JOIN EMP_HORARIO H ON H.HOR_ID  = E.HOR_ID
      LEFT JOIN EMP_DEPARTAMENTO D ON D.DEP_ID = E.DEP_ID
      WHERE ${whereClause}
      ORDER BY M.MAR_FECHA, E.EMP_APELLIDO, E.EMP_NOMBRE
    `;

    // ── Query total de empleados activos (para calcular ausencias) ────────────
    const empConditions = ["EMP_ESTADO <> 'I'"];
    const empBinds = {};

    if (departamentoId) {
      empConditions.push("DEP_ID = :departamentoId");
      empBinds.departamentoId = Number(departamentoId);
    }

    if (empleadoId) {
      empConditions.push("EMP_ID = :empleadoId");
      empBinds.empleadoId = Number(empleadoId);
    }

    const sqlTotalEmpleados = `
      SELECT COUNT(*) AS TOTAL
      FROM EMP_EMPLEADO
      WHERE ${empConditions.join(" AND ")}
    `;

    const [resultMarcajes, resultTotal] = await Promise.all([
      executeQuery(sqlMarcajes, binds),
      executeQuery(sqlTotalEmpleados, empBinds)
    ]);

    const marcajes = resultMarcajes.rows;
    const totalEmpleados = Number(resultTotal.rows[0]?.TOTAL ?? 0);

    // ── Resumen por empleado único ────────────────────────────────────────────
    // Reglas: puntual = sin ninguna tardanza; tardanza = al menos una tardanza;
    //         ausencia = sin ningún marcaje en el período.
    const porEmpleado = {};
    for (const m of marcajes) {
      if (!porEmpleado[m.EMP_ID]) {
        porEmpleado[m.EMP_ID] = { tieneTardanza: false, tieneEntrada: false };
      }
      if (m.ENTRADA) porEmpleado[m.EMP_ID].tieneEntrada = true;
      if (m.ESTADO === "Tardanza") porEmpleado[m.EMP_ID].tieneTardanza = true;
    }

    const empleadosConMarcaje = Object.values(porEmpleado);
    const puntual  = empleadosConMarcaje.filter(e =>  e.tieneEntrada && !e.tieneTardanza).length;
    const tardanza = empleadosConMarcaje.filter(e =>  e.tieneTardanza).length;
    const ausencias = Math.max(0, totalEmpleados - empleadosConMarcaje.filter(e => e.tieneEntrada).length);

    // ── Asistencia por día de la semana ───────────────────────────────────────
    const diaMap = {};
    for (const m of marcajes) {
      if (!m.ENTRADA) continue;
      const dia = getDayName(m.FECHA);
      const dayIndex = new Date(
        Number(m.FECHA.slice(0, 4)),
        Number(m.FECHA.slice(5, 7)) - 1,
        Number(m.FECHA.slice(8, 10))
      ).getDay();

      if (!diaMap[dayIndex]) diaMap[dayIndex] = { dia, dayIndex, total: 0 };
      diaMap[dayIndex].total++;
    }

    const asistenciaPorDia = Object.values(diaMap)
      .sort((a, b) => a.dayIndex - b.dayIndex)
      .map(({ dia, total }) => ({ dia, total }));

    // ── Distribución porcentual ───────────────────────────────────────────────
    const totalRegistros = puntual + tardanza + ausencias;
    const pct = (n) => (totalRegistros > 0 ? Math.round((n / totalRegistros) * 100) : 0);

    res.json({
      marcajes,
      resumen: {
        totalEmpleados,
        puntual,
        tardanza,
        ausencias
      },
      asistenciaPorDia,
      distribucion: [
        { estado: "Puntual",  total: puntual,   porcentaje: pct(puntual) },
        { estado: "Tardanza", total: tardanza,  porcentaje: pct(tardanza) },
        { estado: "Ausencia", total: ausencias, porcentaje: pct(ausencias) }
      ]
    });
  } catch (error) {
    console.error("Error en getMarcajesReporte:", error);
    res.status(500).json({
      message: "Error generando reporte de marcajes",
      error: error.message
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers compartidos para construir queries (reutilizados por PDF)
// ─────────────────────────────────────────────────────────────────────────────
function buildMarcajesQuery(params) {
  const { empleadoId, departamentoId, fechaInicio, fechaFin } = params;

  const conditions = [
    "M.MAR_FECHA >= TO_DATE(:fechaInicio, 'YYYY-MM-DD')",
    "M.MAR_FECHA <  TO_DATE(:fechaFin,    'YYYY-MM-DD') + 1"
  ];
  const binds = { fechaInicio, fechaFin };

  if (empleadoId) {
    conditions.push("E.EMP_ID = :empleadoId");
    binds.empleadoId = Number(empleadoId);
  }
  if (departamentoId) {
    conditions.push("E.DEP_ID = :departamentoId");
    binds.departamentoId = Number(departamentoId);
  }

  const sql = `
    SELECT
      M.MAR_ID,
      E.EMP_ID,
      E.EMP_NOMBRE || ' ' || E.EMP_APELLIDO                    AS EMPLEADO,
      UPPER(SUBSTR(E.EMP_NOMBRE, 1, 1)
            || SUBSTR(E.EMP_APELLIDO, 1, 1))                   AS INICIALES,
      TO_CHAR(M.MAR_FECHA,   'YYYY-MM-DD')                     AS FECHA,
      TO_CHAR(M.MAR_ENTRADA, 'HH24:MI')                        AS ENTRADA,
      TO_CHAR(M.MAR_SALIDA,  'HH24:MI')                        AS SALIDA,
      CASE
        WHEN M.MAR_ENTRADA IS NOT NULL AND M.MAR_SALIDA IS NOT NULL THEN
          FLOOR((M.MAR_SALIDA - M.MAR_ENTRADA) * 24) || 'h ' ||
          LPAD(MOD(ROUND((M.MAR_SALIDA - M.MAR_ENTRADA) * 1440), 60), 2, '0') || 'm'
        ELSE NULL
      END                                                       AS HORAS_TRABAJADAS,
      CASE
        WHEN M.MAR_ENTRADA IS NULL THEN 'Ausente'
        WHEN H.HOR_HORA_INICIO IS NULL THEN 'Puntual'
        WHEN (  TO_NUMBER(TO_CHAR(M.MAR_ENTRADA, 'HH24')) * 60
              + TO_NUMBER(TO_CHAR(M.MAR_ENTRADA, 'MI'))) <=
             (  TO_NUMBER(SUBSTR(H.HOR_HORA_INICIO, 1, 2)) * 60
              + TO_NUMBER(SUBSTR(H.HOR_HORA_INICIO, 4, 2)) + 10)
        THEN 'Puntual'
        ELSE 'Tardanza'
      END                                                       AS ESTADO,
      D.DEP_NOMBRE                                              AS DEPARTAMENTO
    FROM EMP_MARCAJE M
    JOIN  EMP_EMPLEADO    E ON E.EMP_ID  = M.EMP_ID
    LEFT JOIN EMP_HORARIO H ON H.HOR_ID  = E.HOR_ID
    LEFT JOIN EMP_DEPARTAMENTO D ON D.DEP_ID = E.DEP_ID
    WHERE ${conditions.join(" AND ")}
    ORDER BY M.MAR_FECHA, E.EMP_APELLIDO, E.EMP_NOMBRE
  `;

  return { sql, binds };
}

function buildTotalEmpleadosQuery(params) {
  const { empleadoId, departamentoId } = params;
  const conditions = ["EMP_ESTADO <> 'I'"];
  const binds = {};

  if (departamentoId) {
    conditions.push("DEP_ID = :departamentoId");
    binds.departamentoId = Number(departamentoId);
  }
  if (empleadoId) {
    conditions.push("EMP_ID = :empleadoId");
    binds.empleadoId = Number(empleadoId);
  }

  return {
    sql: `SELECT COUNT(*) AS TOTAL FROM EMP_EMPLEADO WHERE ${conditions.join(" AND ")}`,
    binds
  };
}

function calcularResumen(marcajes, totalEmpleados) {
  const porEmpleado = {};
  for (const m of marcajes) {
    if (!porEmpleado[m.EMP_ID]) {
      porEmpleado[m.EMP_ID] = { tieneTardanza: false, tieneEntrada: false };
    }
    if (m.ENTRADA) porEmpleado[m.EMP_ID].tieneEntrada = true;
    if (m.ESTADO === "Tardanza") porEmpleado[m.EMP_ID].tieneTardanza = true;
  }
  const lista = Object.values(porEmpleado);
  const puntual  = lista.filter(e => e.tieneEntrada && !e.tieneTardanza).length;
  const tardanza = lista.filter(e => e.tieneTardanza).length;
  const ausencias = Math.max(0, totalEmpleados - lista.filter(e => e.tieneEntrada).length);
  return { puntual, tardanza, ausencias };
}

// GET /api/reportes/marcajes/pdf
export async function getMarcajesPDF(req, res) {
  try {
    const { empleadoId, departamentoId, fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({
        message: "Los parámetros fechaInicio y fechaFin son requeridos"
      });
    }

    const { sql: sqlM, binds: bindsM } = buildMarcajesQuery(req.query);
    const { sql: sqlT, binds: bindsT } = buildTotalEmpleadosQuery(req.query);

    const [resultM, resultT] = await Promise.all([
      executeQuery(sqlM, bindsM),
      executeQuery(sqlT, bindsT)
    ]);

    const marcajes = resultM.rows;
    const totalEmpleados = Number(resultT.rows[0]?.TOTAL ?? 0);
    const { puntual, tardanza, ausencias } = calcularResumen(marcajes, totalEmpleados);

    // ── Generar PDF ───────────────────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="reporte-marcajes-${fechaInicio}-${fechaFin}.pdf"`
    );
    doc.pipe(res);

    const AZUL    = "#1E40AF";
    const GRIS    = "#6B7280";
    const VERDE   = "#16A34A";
    const NARANJA = "#D97706";
    const ROJO    = "#DC2626";
    const NEGRO   = "#111827";
    const BGCARD  = "#F3F4F6";
    const pageW   = doc.page.width - 80; // ancho útil

    // ── Encabezado ────────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 60).fill(AZUL);
    doc
      .fillColor("white")
      .fontSize(18)
      .font("Helvetica-Bold")
      .text("Reporte de Marcajes", 40, 14);
    doc
      .fontSize(9)
      .font("Helvetica")
      .text("Control de asistencia y puntualidad por empleado", 40, 36);
    doc
      .text(`Período: ${fechaInicio}  →  ${fechaFin}`, doc.page.width - 250, 28, {
        width: 210,
        align: "right"
      });

    let y = 80;

    // ── Tarjetas de resumen ───────────────────────────────────────────────────
    const cards = [
      { label: "Total empleados", valor: totalEmpleados, color: NEGRO   },
      { label: "Puntual",         valor: puntual,         color: VERDE   },
      { label: "Tardanzas",       valor: tardanza,        color: NARANJA },
      { label: "Ausencias",       valor: ausencias,       color: ROJO    }
    ];
    const cardW = (pageW - 30) / 4;

    cards.forEach((c, i) => {
      const cx = 40 + i * (cardW + 10);
      doc.roundedRect(cx, y, cardW, 50, 4).fill(BGCARD);
      doc.fillColor(GRIS).fontSize(8).font("Helvetica").text(c.label, cx + 8, y + 8);
      doc.fillColor(c.color).fontSize(20).font("Helvetica-Bold").text(String(c.valor), cx + 8, y + 20);
    });

    y += 68;

    // ── Tabla ─────────────────────────────────────────────────────────────────
    const cols = [
      { header: "Empleado",        width: 160 },
      { header: "Departamento",    width: 110 },
      { header: "Fecha",           width: 80  },
      { header: "Entrada",         width: 60  },
      { header: "Salida",          width: 60  },
      { header: "Horas trabajadas",width: 90  },
      { header: "Estado",          width: 70  }
    ];

    // Cabecera de tabla
    doc.rect(40, y, pageW, 18).fill(AZUL);
    let cx = 40;
    doc.fillColor("white").fontSize(8).font("Helvetica-Bold");
    for (const col of cols) {
      doc.text(col.header, cx + 4, y + 4, { width: col.width - 8 });
      cx += col.width;
    }
    y += 18;

    // Filas
    const ROW_H = 16;
    doc.fontSize(8).font("Helvetica");

    for (let i = 0; i < marcajes.length; i++) {
      const m = marcajes[i];

      // Nueva página si se acaba el espacio
      if (y + ROW_H > doc.page.height - 40) {
        doc.addPage();
        y = 40;
        // Re-dibujar cabecera
        doc.rect(40, y, pageW, 18).fill(AZUL);
        cx = 40;
        doc.fillColor("white").fontSize(8).font("Helvetica-Bold");
        for (const col of cols) {
          doc.text(col.header, cx + 4, y + 4, { width: col.width - 8 });
          cx += col.width;
        }
        y += 18;
        doc.fontSize(8).font("Helvetica");
      }

      // Fondo alternado
      doc.rect(40, y, pageW, ROW_H).fill(i % 2 === 0 ? "white" : BGCARD);

      // Color del estado
      const estadoColor =
        m.ESTADO === "Puntual"  ? VERDE   :
        m.ESTADO === "Tardanza" ? NARANJA : ROJO;

      const valores = [
        m.EMPLEADO        || "-",
        m.DEPARTAMENTO    || "-",
        m.FECHA           || "-",
        m.ENTRADA         || "-",
        m.SALIDA          || "-",
        m.HORAS_TRABAJADAS || "-",
        m.ESTADO          || "-"
      ];

      cx = 40;
      for (let j = 0; j < cols.length; j++) {
        const isEstado = j === cols.length - 1;
        doc.fillColor(isEstado ? estadoColor : NEGRO);
        if (isEstado) doc.font("Helvetica-Bold");
        doc.text(valores[j], cx + 4, y + 4, { width: cols[j].width - 8 });
        if (isEstado) doc.font("Helvetica");
        cx += cols[j].width;
      }
      y += ROW_H;
    }

    if (marcajes.length === 0) {
      doc.fillColor(GRIS).text("Sin registros para el período seleccionado", 40, y + 6, {
        width: pageW,
        align: "center"
      });
    }

    // ── Pie de página ─────────────────────────────────────────────────────────
    const pages = doc.bufferedPageRange ? doc.bufferedPageRange() : null;
    doc
      .fillColor(GRIS)
      .fontSize(7)
      .text(
        `Generado el ${new Date().toLocaleDateString("es-GT")} — Innova Home · Gestión de Planilla`,
        40,
        doc.page.height - 25,
        { width: pageW, align: "center" }
      );

    doc.end();
  } catch (error) {
    console.error("Error en getMarcajesPDF:", error);
    if (!res.headersSent) {
      res.status(500).json({
        message: "Error generando PDF de marcajes",
        error: error.message
      });
    }
  }
}
