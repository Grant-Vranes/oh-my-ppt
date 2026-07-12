export {
  buildShapeElementHtml,
  buildIconElementHtml,
  isValidBlockId,
  isValidColor,
  type InsertShapeType,
  type InsertElementLayout,
  type BuildShapeOptions,
  type BuildIconOptions
} from './buildInsertElementHtml'
export { SHAPE_REGISTRY, SHAPE_LIST, getShapeDefinition, type ShapeDefinition } from './shapeRegistry'
export {
  ICON_LIST,
  ICON_VIEWBOX,
  getIconDefinition,
  iconOuterSvgAttrs,
  isRegisteredIconId,
  serializeIconInner,
  type IconDefinition,
  type IconNodeTuple
} from './iconRegistry'
