<p>
  <a href="https://npm-stat.com/charts.html?package=sortable-dnd">
    <img alt="Downloads" src="https://img.shields.io/npm/dm/sortable-dnd.svg">
  </a>
  <a href="https://www.npmjs.com/package/sortable-dnd">
    <img alt="Version" src="https://img.shields.io/npm/v/sortable-dnd.svg"/>
  </a>
</p>

# sortable-dnd

JS Library for Drag and Drop, supports Sortable and Draggable

# Usage

**HTML**
```html
<div id="content"></div>
```

**JavaScript**
```js
import Sortable from 'sortable-dnd'

var drag = new Sortable({
  group: document.getElementById('content'),
  draggable: (e) => {
    return e.target
  },
  dragEnd: (pre, cur) => {
    ...
  }
})
```

When the component you created is destroyed, you need to destroy the `drag(new Draggable)`like this

```js
drag.destroy()
```

# Options

| **option** | **type** | **default** | **Description** |
|-------------|--------------|--------------|--------------|
| `group` | `HTMLElement` | - | List parent element |
| `scroll` | `HTMLElement` | - | List scroll element. If not passed, the default is the same as the group |
| `draggable` | `Function` | (e) => e.target | Specifies the drag and drop element, which must return an HTMLElement |
| `dragEnd` | `Function` | (pre, cur) => {} | The callback function when the drag is completed |
| `ghostStyle` | `Object` | {} | The style of the mask element when dragging |
| `ghostClass` | `String` | '' | The class of the mask element when dragging |
| `animation` | `Number` | 300 | animation delay |

# methods

| **method** | **Description** |
|-------------|--------------|
| `destroy` | Destroy the component and empty its contents |
