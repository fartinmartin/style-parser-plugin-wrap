# style-parser-plugin-wrap

An example plugin for [`@motiondeveloper/style-parser`](https://github.com/motiondeveloper/style-parser), specifically for PR #4.

Requires `FontMetrics` for each font your text layer supports. Example use:

```js
const { parse, createTextStyle } = footage('style-parser.jsx').sourceData.get();
const { wrap } = footage('style-parser-plugin-wrap.jsx').sourceData;

const { RobotoRegular } = footage('roboto-regular.jsx').sourceData;
const { RobotoBold } = footage('roboto-bold.jsx').sourceData;
const { RobotoItalic } = footage('roboto-italic.jsx').sourceData;

const inputLayer = thisComp.layer('Input');
const inputText = inputLayer.text.sourceText.value;

const styles = {
  font: 'Roboto-Regular',
  fontSize: 40,
  leading: 48,
};

parse(inputText, {
  textStyle: createTextStyle(styles),
  fontMap: {
    regular: 'Roboto-Regular',
    bold: 'Roboto-Bold',
    italic: 'Roboto-Italic',
  },
  plugins: [
    wrap({
      maxWidth: effect('Max Width')(1).value,
      styles,
      fontMetrics: {
        'Roboto-Regular': RobotoRegular,
        'Roboto-Bold': RobotoBold,
        'Roboto-Italic': RobotoItalic,
      },
    }),
  ],
});
```

---

## How

This plugin wraps the `parsed.text` string to a specified width, inserting line breaks and handling indentation for hanging bullets.

It calculates the width of each character based on the provided `FontMetrics` and the `font` and `fontSize` values at the character's index.

If a transform adds characters to `parsed.text` (e.g. for hanging bullets) the appropriate `Tansforms` in `parsed.transforms` will be updated to reflect their new index values.

To create `FontMetrics` for your specific fonts, use the web tool and use in expressions as necessary:

```js
const { RobotoRegular } = footage('roboto-regular.jsx').sourceData;
const { RobotoBold } = footage('roboto-bold.jsx').sourceData;
const { RobotoItalic } = footage('roboto-italic.jsx').sourceData;

// later...
wrap({
  maxWidth: effect('Max Width')(1).value,
  styles,
  fontMetrics: {
    'Roboto-Regular': RobotoRegular,
    'Roboto-Bold': RobotoBold,
    'Roboto-Italic': RobotoItalic,
  },
});
```

## Why

After Effects has two types of text layers: point text and paragraph text (sometimes called 'box text' or 'area text'). Traditionally, if you want your text to automatically wrap at a given width, you would use paragraph text:

> When you enter _point text_, each line of text is independent—the length of a line increases or decreases as you edit the text, but it doesn’t wrap to the next line.

> When you enter _paragraph text_, the lines of text wrap to fit the dimensions of the bounding box. You can enter multiple paragraphs and apply paragraph formatting.

<sup><a href="https://helpx.adobe.com/after-effects/using/creating-editing-text-layers.html#enter_point_text" target="_blank">Creating and editing text layers on Adobe.com</a></sup>

This works great until you need to know when your text is wrapping.

For example, [`@motiondeveloper/aefunctions`](https://github.com/motiondeveloper/aefunctions) provides [`layerRect()`](https://github.com/motiondeveloper/aefunctions/blob/a6a777177fe0e0acb5451a0f0f265fecd41153a1/src/index.ts#L286), a utility to get the size of a text layer using the font's `xHeight` instead of the layer's `sourceRectAtTime()`:

```js
const { fontSize, leading } = thisLayer.text.sourceText.style;
const xHeight = fontSize / 2;
const totalHeight = xHeight + leading * (numLines - 1);
```

Tim Haywood does [an excellent job explaining](https://motiondeveloper.com/blog/dealing-with-descenders) why this is desired.

However! You may have noticed above that in order to calculate the `totalHeight` we need to know the number of lines. `layerRect()` does this by [counting the total number](https://github.com/motiondeveloper/aefunctions/blob/a6a777177fe0e0acb5451a0f0f265fecd41153a1/src/index.ts#L353) of return, new line, and "end of text" characters in our text.

If our text layer is a _paragraph text_ layer, After Effects will wrap our text without the use of these characters and we will have no way of knowing how many lines are rendered or where in our text line breaks occur!

Thus, if we want to use `layerRect()`, we should use _point text_. With point text we can manually enter return characters and our calculated height will react accordingly.

This is where this plugin comes into play. We're likely using `layerRect()` inside of a template. A good template will make breaking things hard for the user to do. With that in mind, it would be ideal if users of our template didn't have to be responsible for adding manual line breaks. With `wrap()` they won't have to!

This functionality could act on `textLayer.text.sourceText` directly, however it would need to poll `getStyleAt(index)` for each character, which in early tests seemed very slow! Since `style-parser` tracks styles at index values via the `parsed.transforms` array, we can make these calculations much faster as a `style-parser` plugin.
