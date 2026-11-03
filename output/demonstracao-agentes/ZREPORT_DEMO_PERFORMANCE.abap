REPORT zreport_demo_performance.

* Analise estatica; problemas intencionais. Nao executar na demo.
* Validar release, DDIC e autorizacoes antes de uso no SAP.
TABLES ekko.
SELECT-OPTIONS: s_bukrs FOR ekko-bukrs OBLIGATORY,
                s_bedat FOR ekko-bedat OBLIGATORY.
DATA: lt_ekko TYPE STANDARD TABLE OF ekko,
      ls_ekko TYPE ekko,
      lt_ekpo TYPE STANDARD TABLE OF ekpo,
      ls_ekpo TYPE ekpo.

START-OF-SELECTION.
  SELECT * FROM ekko INTO TABLE lt_ekko
    WHERE bukrs IN s_bukrs AND bedat IN s_bedat.
  IF lt_ekko IS INITIAL.
    WRITE / 'Nenhum pedido encontrado.'.
    RETURN.
  ENDIF.

  LOOP AT lt_ekko INTO ls_ekko.
    CLEAR lt_ekpo.
    SELECT * FROM ekpo INTO TABLE lt_ekpo
      WHERE ebeln = ls_ekko-ebeln.
    LOOP AT lt_ekpo INTO ls_ekpo.
      WRITE: / ls_ekko-ebeln, ls_ekpo-ebelp,
               ls_ekpo-matnr, ls_ekpo-menge, ls_ekpo-meins.
    ENDLOOP.
  ENDLOOP.
