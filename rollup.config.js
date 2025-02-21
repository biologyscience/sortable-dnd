import babel from 'rollup-plugin-babel'
import { uglify } from 'rollup-plugin-uglify'
import resolve from 'rollup-plugin-node-resolve'
import commonJs from 'rollup-plugin-commonjs'
const packageJson = require('./package.json')
const version = packageJson.version
const homepage = packageJson.homepage

const banner = `
/*!
 * sortable-dnd v${version}
 * open source under the MIT license
 * ${homepage}
 */
`

export default {
  external: ['vue'],
  input: 'src/Sortable.js',
  output: [
    {
      format: 'umd',
      file: 'dist/sortable.js',
      name: 'Sortable',
      sourcemap: false,
      banner: banner.replace(/\n/, '')
    },
    {
      format: 'umd',
      file: 'dist/sortable.min.js',
      name: 'Sortable',
      sourcemap: false,
      banner: banner.replace(/\n/, ''),
      plugins: [uglify()]
    },
  ],
  plugins: [
    babel(),
    resolve(),
    commonJs()
  ]
}
