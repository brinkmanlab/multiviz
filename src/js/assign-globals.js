// Hack to deal with jenk import pattern in parcel for global variables
import d3 from './d3.min'
window.d3 = d3;
import jquery from '../plugins/jQuery/jquery-2.2.3.min';
window.$ = window.jQuery = jquery;
