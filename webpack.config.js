import HtmlWebpackPlugin from 'html-webpack-plugin'
import HtmlWebpackInlineSourcePlugin from 'html-webpack-inline-source-plugin'

module.exports = {
    entry: 'index.js',
    output: {
        path: './dist',
        filename: 'index_bundle.js'
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: 'html-loader!./src/index.html',
            inlineSource: '.(js|css)$', // embed all javascript and css inline
            inject: 'head',
        }),
        new HtmlWebpackInlineSourcePlugin()
    ]
}
