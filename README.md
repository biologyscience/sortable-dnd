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

var DND = new Sortable(
  document.getElementById('content'),
  {
    draggable: (e) => {
      return true
    }, // or draggable: '.class'
    dragging: (e) => {
      return e.target
    },
    dragEnd: (pre, cur) => {
      ...
    }
  }
)
```

When the component you created is destroyed, you need to destroy the `new Sortable` like this

```js
DND.destroy()
```

# Options

| **option** | **type** | **default** | **Description** |
|-------------|--------------|--------------|--------------|
| `draggable` | `String/Function` | - | Specifies which items inside the element should be draggable, the function type must return a boolean |
| `dragging` | `Function` | (e) => e.target | Specifies the drag and drop element, which must return an HTMLElement |
| `dragEnd` | `Function` | (pre, cur) => {} | The callback function when the drag is completed |
| `ghostStyle` | `Object` | {} | The style of the mask element when dragging |
| `ghostClass` | `String` | '' | The class of the mask element when dragging |
| `chosenClass` | `String` | {} | The class of the selected element when dragging |
| `animation` | `Number` | 300 | animation delay |

# methods

| **method** | **Description** |
|-------------|--------------|
| `destroy` | Destroy the component and empty its contents |
