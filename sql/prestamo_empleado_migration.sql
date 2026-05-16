-- Permite que nomina descuente prestamos automaticamente por empleado.
-- Tu modelo actual relaciona EMP_EMPLEADO.PRE_ID -> EMP_PRESTAMO.PRE_ID.
-- Este script solo garantiza la llave foranea si aun no existe.

DECLARE
  v_count NUMBER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM USER_CONSTRAINTS
  WHERE CONSTRAINT_NAME = 'FK_EMPLEADO_PRESTAMO';

  IF v_count = 0 THEN
    EXECUTE IMMEDIATE 'ALTER TABLE EMP_EMPLEADO ADD CONSTRAINT FK_EMPLEADO_PRESTAMO FOREIGN KEY (PRE_ID) REFERENCES EMP_PRESTAMO(PRE_ID)';
  END IF;
END;
/

COMMIT;
