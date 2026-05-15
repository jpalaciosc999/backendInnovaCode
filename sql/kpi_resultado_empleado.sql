/* =========================================================
   KPI Resultado - relacion con empleado

   La vista de bonos de productividad necesita saber a que
   empleado pertenece cada resultado KPI. Este script agrega
   EMP_ID a EMP_KPI_RESULTADO y crea la llave foranea.
   ========================================================= */

DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM USER_TAB_COLUMNS
  WHERE TABLE_NAME = 'EMP_KPI_RESULTADO'
    AND COLUMN_NAME = 'EMP_ID';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE EMP_KPI_RESULTADO ADD (EMP_ID NUMBER(10))';
  END IF;
END;
/

DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM USER_CONSTRAINTS
  WHERE CONSTRAINT_NAME = 'FK_KPI_RESULTADO_EMPLEADO';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE '
      ALTER TABLE EMP_KPI_RESULTADO
      ADD CONSTRAINT FK_KPI_RESULTADO_EMPLEADO
      FOREIGN KEY (EMP_ID)
      REFERENCES EMP_EMPLEADO (EMP_ID)
    ';
  END IF;
END;
/

DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM USER_INDEXES
  WHERE INDEX_NAME = 'IX_KPI_RESULTADO_EMP_ID';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'CREATE INDEX IX_KPI_RESULTADO_EMP_ID ON EMP_KPI_RESULTADO (EMP_ID)';
  END IF;
END;
/
