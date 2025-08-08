const escpos = require('escpos');
escpos.USB = require('escpos-usb');

exports.printTicket = (number, recordDate, recordTime) => {
    const device = new escpos.USB();
    const printer = new escpos.Printer(device);

    const now = new Date();
    const issueDate = now.toLocaleDateString('uk-UA');
    const issueTime = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
        
    device.open(() => {
        printer
        .encode('UTF-8')
        .align('CT')
        .size(1, 1)
        .text('Ваш номер черги')
        .text('------------------------')
        .text('')

        .size(2, 2)
        .text(`${number}`)
        .text('')
        .text('------------------------')

        .size(1, 1)
        .text('Дата та Час запису')
        .text(`${recordDate} ${recordTime}`)
        .text('')

        .text(`${issueDate} ${issueTime}`)
        .cut()
        .close();
    });
};
