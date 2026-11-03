REPORT zreport_demo_saldo_com_erros.

* Dados ficticios. Bugs intencionais. Sem acesso a tabelas SAP.
* ABAP 7.50+; sintaxe e execucao nao validadas no ambiente.
TYPES: BEGIN OF ty_item,
         ebeln TYPE c LENGTH 10,
         ebelp TYPE n LENGTH 5,
         texto TYPE c LENGTH 30,
         pedido TYPE p LENGTH 8 DECIMALS 3,
         recebido TYPE p LENGTH 8 DECIMALS 3,
         saldo TYPE p LENGTH 8 DECIMALS 3,
       END OF ty_item.
TYPES: BEGIN OF ty_recebimento,
         ebeln TYPE c LENGTH 10,
         ebelp TYPE n LENGTH 5,
         quantidade TYPE p LENGTH 8 DECIMALS 3,
       END OF ty_recebimento.
DATA: lt_itens TYPE STANDARD TABLE OF ty_item,
      ls_item TYPE ty_item,
      lt_recebimentos TYPE STANDARD TABLE OF ty_recebimento,
      ls_recebimento TYPE ty_recebimento.

START-OF-SELECTION.
  PERFORM carregar_demo.
  PERFORM calcular_saldo.
  PERFORM exibir_resultado.

FORM carregar_demo.
  CLEAR: lt_itens, lt_recebimentos.
  lt_itens = VALUE #(
    ( ebeln = '4500000100' ebelp = '00010'
      texto = 'Teclado' pedido = 10 )
    ( ebeln = '4500000100' ebelp = '00020'
      texto = 'Mouse' pedido = 20 )
    ( ebeln = '4500000200' ebelp = '00010'
      texto = 'Monitor' pedido = 5 ) ).
  lt_recebimentos = VALUE #(
    ( ebeln = '4500000100' ebelp = '00010' quantidade = 4 )
    ( ebeln = '4500000100' ebelp = '00020' quantidade = 20 ) ).
ENDFORM.

FORM calcular_saldo.
  LOOP AT lt_itens INTO ls_item.
    READ TABLE lt_recebimentos INTO ls_recebimento
      WITH KEY ebeln = ls_item-ebeln.
    ls_item-recebido = ls_recebimento-quantidade.
    ls_item-saldo = ls_item-pedido - ls_item-recebido.
    MODIFY lt_itens FROM ls_item.
  ENDLOOP.
ENDFORM.

FORM exibir_resultado.
  WRITE: / 'Pedido', 15 'Item', 24 'Descricao',
           58 'Pedido', 77 'Recebido', 96 'Saldo'.
  LOOP AT lt_itens INTO ls_item.
    WRITE: / ls_item-ebeln, 15 ls_item-ebelp,
             24 ls_item-texto, 58 ls_item-pedido,
             77 ls_item-recebido, 96 ls_item-saldo.
  ENDLOOP.
ENDFORM.
