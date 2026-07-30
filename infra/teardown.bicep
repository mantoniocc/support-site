targetScope = 'resourceGroup'

metadata description = '''
Plantilla deliberadamente vacia.

Desplegada en modo Complete, ARM elimina del resource group todo recurso que NO
aparezca en la plantilla. Como aqui no hay ninguno, borra todo el contenido pero
conserva el resource group y sus asignaciones de rol.

Por que no "az group delete": el service principal tiene rol Contributor acotado
al resource group. Puede borrar lo de adentro, pero no recrear el grupo. Vaciarlo
en vez de borrarlo mantiene el ciclo up/down repetible sin permisos de suscripcion.
'''
